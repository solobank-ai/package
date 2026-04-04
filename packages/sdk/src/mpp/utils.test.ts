import { describe, it, expect, vi } from 'vitest';
import { address, type Address } from '@solana/kit';
import {
  buildTransferPlan,
  fetchTokenAccounts,
  parseAmountToRaw,
  sumReceivedTokenAmount,
} from './utils.js';

function randomAddress(): Address {
  // Generate a plausible base58 address for testing
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result as Address;
}

describe('parseAmountToRaw', () => {
  it('converts whole number', () => {
    expect(parseAmountToRaw('1', 6)).toBe(1_000_000n);
  });

  it('converts cents', () => {
    expect(parseAmountToRaw('0.01', 6)).toBe(10_000n);
  });

  it('converts smallest USDC unit', () => {
    expect(parseAmountToRaw('0.000001', 6)).toBe(1n);
  });

  it('converts dollars and cents', () => {
    expect(parseAmountToRaw('100.50', 6)).toBe(100_500_000n);
  });

  it('truncates below precision', () => {
    expect(parseAmountToRaw('0.0000001', 6)).toBe(0n);
  });
});

describe('fetchTokenAccounts', () => {
  const owner = address('4Nd1mYq2J4pKQnX2NDSSSXWMQZnQXtNCmieYwgdENeoY');
  const mint = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const accountA = randomAddress();
  const accountB = randomAddress();

  it('returns token accounts with parsed balances', async () => {
    const mockRpc = {
      getTokenAccountsByOwner: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: [
            {
              pubkey: accountA,
              account: {
                data: {
                  parsed: {
                    info: {
                      tokenAmount: { amount: '500000' },
                    },
                  },
                },
              },
            },
            {
              pubkey: accountB,
              account: {
                data: {
                  parsed: {
                    info: {
                      tokenAmount: { amount: '300000' },
                    },
                  },
                },
              },
            },
          ],
        }),
      }),
    };

    const result = await fetchTokenAccounts(mockRpc, owner, mint);
    expect(result).toEqual([
      { address: accountA, amount: 500000n },
      { address: accountB, amount: 300000n },
    ]);
    expect(mockRpc.getTokenAccountsByOwner).toHaveBeenCalledTimes(1);
  });

  it('filters out zero-balance and unparsable accounts', async () => {
    const mockRpc = {
      getTokenAccountsByOwner: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue({
          value: [
            {
              pubkey: accountA,
              account: {
                data: {
                  parsed: {
                    info: {
                      tokenAmount: { amount: '0' },
                    },
                  },
                },
              },
            },
            {
              pubkey: accountB,
              account: {
                data: Buffer.alloc(0),
              },
            },
          ],
        }),
      }),
    };

    const result = await fetchTokenAccounts(mockRpc, owner, mint);
    expect(result).toEqual([]);
  });
});

describe('buildTransferPlan', () => {
  const accountA = randomAddress();
  const accountB = randomAddress();

  it('splits the request across multiple token accounts', () => {
    const plan = buildTransferPlan(
      [
        { address: accountA, amount: 600000n },
        { address: accountB, amount: 500000n },
      ],
      900000n,
    );

    expect(plan).toEqual([
      { address: accountA, amount: 600000n },
      { address: accountB, amount: 300000n },
    ]);
  });

  it('throws when the accounts cannot cover the amount', () => {
    expect(() =>
      buildTransferPlan([{ address: accountA, amount: 1000n }], 2000n),
    ).toThrow('Insufficient token balance');
  });
});

describe('sumReceivedTokenAmount', () => {
  it('sums positive deltas for the recipient and mint only', () => {
    const received = sumReceivedTokenAmount(
      [
        {
          accountIndex: 0,
          mint: 'mint-a',
          owner: 'recipient',
          uiTokenAmount: { amount: '100', decimals: 6 },
        },
      ],
      [
        {
          accountIndex: 0,
          mint: 'mint-a',
          owner: 'recipient',
          uiTokenAmount: { amount: '600', decimals: 6 },
        },
        {
          accountIndex: 1,
          mint: 'mint-a',
          owner: 'someone-else',
          uiTokenAmount: { amount: '999', decimals: 6 },
        },
      ],
      'mint-a',
      'recipient',
    );

    expect(received).toBe(500n);
  });
});
