import { describe, it, expect, vi } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  buildTransferPlan,
  fetchTokenAccounts,
  parseAmountToRaw,
  sumReceivedTokenAmount,
} from './utils.js';

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
  const owner = new PublicKey('4Nd1mYq2J4pKQnX2NDSSSXWMQZnQXtNCmieYwgdENeoY');
  const mint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const accountA = Keypair.generate().publicKey;
  const accountB = Keypair.generate().publicKey;

  it('returns token accounts with parsed balances', async () => {
    const mockClient = {
      getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
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
    };

    const result = await fetchTokenAccounts(mockClient as any, owner, mint);
    expect(result).toEqual([
      { address: accountA, amount: 500000n },
      { address: accountB, amount: 300000n },
    ]);
    expect(mockClient.getParsedTokenAccountsByOwner).toHaveBeenCalledTimes(1);
  });

  it('filters out zero-balance and unparsable accounts', async () => {
    const mockClient = {
      getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
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
    };

    const result = await fetchTokenAccounts(mockClient as any, owner, mint);
    expect(result).toEqual([]);
  });
});

describe('buildTransferPlan', () => {
  const accountA = Keypair.generate().publicKey;
  const accountB = Keypair.generate().publicKey;

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
          uiTokenAmount: { amount: '100' },
        } as any,
      ],
      [
        {
          accountIndex: 0,
          mint: 'mint-a',
          owner: 'recipient',
          uiTokenAmount: { amount: '600' },
        } as any,
        {
          accountIndex: 1,
          mint: 'mint-a',
          owner: 'someone-else',
          uiTokenAmount: { amount: '999' },
        } as any,
      ],
      'mint-a',
      'recipient',
    );

    expect(received).toBe(500n);
  });
});
