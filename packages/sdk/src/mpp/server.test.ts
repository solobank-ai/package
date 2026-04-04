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
          uiTokenAmount: { amount: before, decimals: 6 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint,
          owner: recipient,
          uiTokenAmount: { amount: after, decimals: 6 },
        },
      ],
    },
  };
}

// Valid base58 mock signature (88 chars)
const MOCK_SIG = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

function buildCredential(signature = MOCK_SIG, amount = '0.01') {
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

const mockGetTransaction = vi.fn();

vi.mock('@solana/kit', async () => {
  const actual = await vi.importActual<typeof import('@solana/kit')>('@solana/kit');
  return {
    ...actual,
    createSolanaRpc: vi.fn(() => ({
      getTransaction: vi.fn(() => ({
        send: mockGetTransaction,
      })),
    })),
  };
});

describe('server verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts valid payment with correct amount', async () => {
    mockGetTransaction.mockResolvedValue(buildMockTx());

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
    });

    const result = await (serverMethod as any).verify({
      credential: buildCredential(),
    });

    expect(result.reference).toBe(MOCK_SIG);
    expect(result.status).toBe('success');
  });

  it('rejects failed transaction', async () => {
    mockGetTransaction.mockResolvedValue(buildMockTx({ err: { InstructionError: [0, 'Custom'] } }));

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
    mockGetTransaction.mockResolvedValue(
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
    mockGetTransaction.mockResolvedValue(buildMockTx({ after: '5000' }));

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
    mockGetTransaction.mockResolvedValue(null);

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Transaction not found');
  });

  it('rejects when payment reference was already consumed (atomic)', async () => {
    mockGetTransaction.mockResolvedValue(buildMockTx());

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
      tryConsumeReference: vi.fn().mockResolvedValue(false), // already used
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Payment reference already used');
  });

  it('rejects when payment reference was already consumed (legacy)', async () => {
    mockGetTransaction.mockResolvedValue(buildMockTx());

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
      tryConsumeReference: vi.fn().mockResolvedValue(false),
    });

    await expect(
      (serverMethod as any).verify({ credential: buildCredential() }),
    ).rejects.toThrow('Payment reference already used');
  });

  it('calls tryConsumeReference after successful verification', async () => {
    mockGetTransaction.mockResolvedValue(buildMockTx());
    const tryConsume = vi.fn().mockResolvedValue(true);

    const { solana } = await import('./server.js');
    const serverMethod = solana({
      currency: USDC_MINT,
      recipient: RECIPIENT,
      tryConsumeReference: tryConsume,
    });

    await (serverMethod as any).verify({ credential: buildCredential() });

    expect(tryConsume).toHaveBeenCalledWith(MOCK_SIG);
  });
});
