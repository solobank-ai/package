import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, Transaction } from '@solana/web3.js';
import { fetchTokenAccounts } from './utils.js';

vi.mock('./utils.js', async () => {
  const actual = await vi.importActual<typeof import('./utils.js')>('./utils.js');
  return {
    ...actual,
    fetchTokenAccounts: vi.fn(),
  };
});

describe('client createCredential', () => {
  const signer = Keypair.generate();
  const recipient = Keypair.generate().publicKey.toBase58();
  const currency = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const mockConnection = {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 123,
    }),
    sendRawTransaction: vi.fn().mockResolvedValue('solana-signature'),
    confirmTransaction: vi.fn().mockResolvedValue({
      value: { err: null },
    }),
  };
  const mockSigner = {
    publicKey: signer.publicKey,
    signTransaction: vi.fn(async (tx: Transaction) => {
      tx.partialSign(signer);
      return tx;
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws on insufficient balance', async () => {
    vi.mocked(fetchTokenAccounts).mockResolvedValue([
      { address: Keypair.generate().publicKey, amount: 5000n },
    ]);

    const { solana } = await import('./client.js');
    const clientMethod = solana({
      connection: mockConnection as any,
      signer: mockSigner,
    });

    await expect(
      (clientMethod as any).createCredential({
        challenge: {
          request: {
            amount: '1.00',
            currency,
            recipient,
          },
        },
      }),
    ).rejects.toThrow('Not enough USDC');
  });

  it('throws when no token accounts exist', async () => {
    vi.mocked(fetchTokenAccounts).mockResolvedValue([]);

    const { solana } = await import('./client.js');
    const clientMethod = solana({
      connection: mockConnection as any,
      signer: mockSigner,
    });

    await expect(
      (clientMethod as any).createCredential({
        challenge: {
          request: {
            amount: '0.01',
            currency,
            recipient,
          },
        },
      }),
    ).rejects.toThrow('No USDC balance');
  });

  it('builds and signs a transfer that spans multiple token accounts', async () => {
    vi.mocked(fetchTokenAccounts).mockResolvedValue([
      { address: Keypair.generate().publicKey, amount: 6000n },
      { address: Keypair.generate().publicKey, amount: 8000n },
    ]);

    const { solana } = await import('./client.js');
    const clientMethod = solana({
      connection: mockConnection as any,
      signer: mockSigner,
    });

    const credential = await (clientMethod as any).createCredential({
      challenge: {
        request: {
          amount: '0.01',
          currency,
          recipient,
        },
      },
    });

    expect(mockSigner.signTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.confirmTransaction).toHaveBeenCalledTimes(1);
    expect(credential).toBeDefined();
  });

  it('uses custom execute when provided', async () => {
    vi.mocked(fetchTokenAccounts).mockResolvedValue([
      { address: Keypair.generate().publicKey, amount: 20000n },
    ]);

    const execute = vi.fn().mockResolvedValue({ signature: 'custom-sig' });
    const { solana } = await import('./client.js');
    const clientMethod = solana({
      connection: mockConnection as any,
      signer: mockSigner,
      execute,
    });

    const credential = await (clientMethod as any).createCredential({
      challenge: {
        request: {
          amount: '0.01',
          currency,
          recipient,
        },
      },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(mockSigner.signTransaction).not.toHaveBeenCalled();
    expect(credential).toBeDefined();
  });
});
