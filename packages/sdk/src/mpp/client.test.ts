import { beforeEach, describe, expect, it, vi } from 'vitest';
import { address, type Address } from '@solana/kit';
import { fetchTokenAccounts } from './utils.js';

vi.mock('./utils.js', async () => {
  const actual = await vi.importActual<typeof import('./utils.js')>('./utils.js');
  return {
    ...actual,
    fetchTokenAccounts: vi.fn(),
  };
});

function randomAddress(): Address {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result as Address;
}

const mockSignerAddress = address('4Nd1mYq2J4pKQnX2NDSSSXWMQZnQXtNCmieYwgdENeoY');
const RECIPIENT = '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS';
const CURRENCY = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MOCK_ATA = randomAddress();

// Mock @solana/kit
const mockGetLatestBlockhash = vi.fn().mockReturnValue({
  send: vi.fn().mockResolvedValue({
    value: {
      blockhash: '11111111111111111111111111111111' as any,
      lastValidBlockHeight: 123n,
    },
  }),
});

const mockSendAndConfirm = vi.fn().mockResolvedValue(undefined);

vi.mock('@solana/kit', async () => {
  const actual = await vi.importActual<typeof import('@solana/kit')>('@solana/kit');
  return {
    ...actual,
    createSolanaRpc: vi.fn(() => ({
      getLatestBlockhash: mockGetLatestBlockhash,
      getTokenAccountsByOwner: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({ value: [] }),
      }),
    })),
    createSolanaRpcSubscriptions: vi.fn(() => ({})),
    sendAndConfirmTransactionFactory: vi.fn(() => mockSendAndConfirm),
    compileTransaction: vi.fn(() => ({ mock: 'compiled' })),
    signTransaction: vi.fn(async () => ({
      mock: 'signed',
      signatures: { [mockSignerAddress]: new Uint8Array(64).fill(1) },
    })),
    getSignatureFromTransaction: vi.fn(() => 'solana-signature'),
    getBase64EncodedWireTransaction: vi.fn(() => 'base64tx'),
    assertIsTransactionWithinSizeLimit: vi.fn(),
  };
});

// Mock @solana-program/token
vi.mock('@solana-program/token', () => ({
  TOKEN_PROGRAM_ADDRESS: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  findAssociatedTokenPda: vi.fn().mockResolvedValue([MOCK_ATA, 255]),
  getCreateAssociatedTokenIdempotentInstruction: vi.fn(() => ({ mock: 'createAta' })),
  getTransferCheckedInstruction: vi.fn(() => ({ mock: 'transfer' })),
}));

describe('client createCredential', () => {
  const mockSigner = {
    address: mockSignerAddress,
    keyPair: {} as any,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws on insufficient balance', async () => {
    vi.mocked(fetchTokenAccounts).mockResolvedValue([
      { address: randomAddress(), amount: 5000n },
    ]);

    const { solana } = await import('./client.js');
    const clientMethod = solana({
      rpcUrl: 'https://api.devnet.solana.com',
      signer: mockSigner,
    });

    await expect(
      (clientMethod as any).createCredential({
        challenge: {
          request: {
            amount: '1.00',
            currency: CURRENCY,
            recipient: RECIPIENT,
          },
        },
      }),
    ).rejects.toThrow('Not enough USDC');
  });

  it('throws when no token accounts exist', async () => {
    vi.mocked(fetchTokenAccounts).mockResolvedValue([]);

    const { solana } = await import('./client.js');
    const clientMethod = solana({
      rpcUrl: 'https://api.devnet.solana.com',
      signer: mockSigner,
    });

    await expect(
      (clientMethod as any).createCredential({
        challenge: {
          request: {
            amount: '0.01',
            currency: CURRENCY,
            recipient: RECIPIENT,
          },
        },
      }),
    ).rejects.toThrow('No USDC balance');
  });

  it('builds and signs a transfer that spans multiple token accounts', async () => {
    vi.mocked(fetchTokenAccounts).mockResolvedValue([
      { address: randomAddress(), amount: 6000n },
      { address: randomAddress(), amount: 8000n },
    ]);

    const { solana } = await import('./client.js');
    const clientMethod = solana({
      rpcUrl: 'https://api.devnet.solana.com',
      signer: mockSigner,
    });

    const credential = await (clientMethod as any).createCredential({
      challenge: {
        request: {
          amount: '0.01',
          currency: CURRENCY,
          recipient: RECIPIENT,
        },
      },
    });

    expect(mockSendAndConfirm).toHaveBeenCalledTimes(1);
    expect(credential).toBeDefined();
  });

  it('uses custom execute when provided', async () => {
    vi.mocked(fetchTokenAccounts).mockResolvedValue([
      { address: randomAddress(), amount: 20000n },
    ]);

    const execute = vi.fn().mockResolvedValue({ signature: 'custom-sig' });
    const { solana } = await import('./client.js');
    const clientMethod = solana({
      rpcUrl: 'https://api.devnet.solana.com',
      signer: mockSigner,
      execute,
    });

    const credential = await (clientMethod as any).createCredential({
      challenge: {
        request: {
          amount: '0.01',
          currency: CURRENCY,
          recipient: RECIPIENT,
        },
      },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(mockSendAndConfirm).not.toHaveBeenCalled();
    expect(credential).toBeDefined();
  });
});
