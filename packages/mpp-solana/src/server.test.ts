import { beforeEach, describe, expect, it, vi } from 'vitest';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RECIPIENT = '4Nd1mYq2J4pKQnX2NDSSSXWMQZnQXtNCmieYwgdENeoY';

function buildMockTx({
  err = null,
  mint = USDC_MINT,
  recipient = RECIPIENT,
  before = '0',
  after = '10000',
}: {
  err?: unknown;
  mint?: string;
  recipient?: string;
  before?: string;
  after?: string;
} = {}) {
  return {
    meta: {
      err,
      preTokenBalances: [
        {
          accountIndex: 0,
          mint,
          owner: recipient,
          uiTokenAmount: { amount: before },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint,
          owner: recipient,
          uiTokenAmount: { amount: after },
        },
      ],
    },
  };
}

function buildCredential(signature = 'solana-signature', amount = '0.01') {
  return {
    payload: { signature },
    challenge: {
      request: {
        amount,
        currency: USDC_MINT,
        recipient: RECIPIENT,
      },
    },
  };
}

const mockGetParsedTransaction = vi.fn();

vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual<typeof import('@solana/web3.js')>('@solana/web3.js');
  return {
    ...actual,
    Connection: vi.fn().mockImplementation(() => ({
      getParsedTransaction: mockGetParsedTransaction,
    })),
    clusterApiUrl: vi.fn(() => 'https://api.mainnet-beta.solana.com'),
  };
});

describe('server verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts valid payment with correct amount', async () => {
    mockGetParsedTransaction.mockResolvedValue(buildMockTx());

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
    });

    const result = await (serverMethod as any).verify({
      credential: buildCredential(),
    });

    expect(result.reference).toBe('solana-signature');
    expect(result.status).toBe('success');
  });

  it('rejects failed transaction', async () => {
    mockGetParsedTransaction.mockResolvedValue(buildMockTx({ err: { InstructionError: [0, 'Custom'] } }));

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Transaction failed on-chain');
  });

  it('rejects when payment not sent to the configured recipient', async () => {
    mockGetParsedTransaction.mockResolvedValue(
      buildMockTx({ recipient: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS' }),
    );

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Payment not found');
  });

  it('rejects when amount is less than requested', async () => {
    mockGetParsedTransaction.mockResolvedValue(buildMockTx({ after: '5000' }));

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Transferred');
  });

  it('rejects when transaction cannot be found', async () => {
    mockGetParsedTransaction.mockResolvedValue(null);

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Could not find the referenced transaction');
  });

  it('rejects when payment reference was already consumed', async () => {
    mockGetParsedTransaction.mockResolvedValue(buildMockTx());

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
      isReferenceConsumed: vi.fn().mockResolvedValue(true),
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Payment reference already used');
  });

  it('marks the reference as consumed after successful verification', async () => {
    mockGetParsedTransaction.mockResolvedValue(buildMockTx());
    const markReferenceConsumed = vi.fn().mockResolvedValue(undefined);

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
      markReferenceConsumed,
    });

    await (serverMethod as any).verify({ credential: buildCredential() });

    expect(markReferenceConsumed).toHaveBeenCalledWith('solana-signature');
  });
});
