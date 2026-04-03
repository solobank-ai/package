import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getSwapQuote, getSwapTransaction, toSwapExecutionResult } from './swap.js';

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch;
  delete process.env.SOLOBANK_JUP_BASE_URL;
  delete process.env.SOLOBANK_JUP_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const MOCK_QUOTE = {
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  inAmount: '1000000000',
  outAmount: '15000000',
  otherAmountThreshold: '14900000',
  swapMode: 'ExactIn',
  slippageBps: 50,
  priceImpactPct: '0.01',
  routePlan: [
    { swapInfo: { label: 'Raydium' } },
    { swapInfo: { label: 'Orca' } },
  ],
};

describe('getSwapQuote', () => {
  it('fetches quote from Jupiter and parses response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => MOCK_QUOTE,
    });

    const quote = await getSwapQuote({ fromAsset: 'SOL', toAsset: 'USDC', amount: 1 });

    expect(quote.inputSymbol).toBe('SOL');
    expect(quote.outputSymbol).toBe('USDC');
    expect(quote.inAmount).toBe(1);
    expect(quote.outAmount).toBe(15);
    expect(quote.priceImpactPct).toBe(0.01);
    expect(quote.routeLabels).toEqual(['Raydium', 'Orca']);
    expect(quote.slippageBps).toBe(50);

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/swap/v1/quote');
    expect(url.searchParams.get('inputMint')).toBe('So11111111111111111111111111111111111111112');
    expect(url.searchParams.get('outputMint')).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });

  it('uses custom Jupiter base URL from env', async () => {
    process.env.SOLOBANK_JUP_BASE_URL = 'https://custom-jup.example.com';
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_QUOTE });

    await getSwapQuote({ fromAsset: 'SOL', toAsset: 'USDC', amount: 1 });

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.origin).toBe('https://custom-jup.example.com');
  });

  it('includes API key header when configured', async () => {
    process.env.SOLOBANK_JUP_API_KEY = 'test-api-key';
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_QUOTE });

    await getSwapQuote({ fromAsset: 'SOL', toAsset: 'USDC', amount: 1 });

    expect(mockFetch.mock.calls[0][1].headers['x-api-key']).toBe('test-api-key');
  });

  it('throws on Jupiter API error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });

    await expect(getSwapQuote({ fromAsset: 'SOL', toAsset: 'USDC', amount: 1 }))
      .rejects.toThrow('Jupiter quote request failed with 429 Too Many Requests');
  });

  it('passes slippageBps and swapMode', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_QUOTE });

    await getSwapQuote({ fromAsset: 'SOL', toAsset: 'USDC', amount: 1, slippageBps: 100, swapMode: 'ExactOut' });

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('slippageBps')).toBe('100');
    expect(url.searchParams.get('swapMode')).toBe('ExactOut');
  });

  it('passes onlyDirectRoutes parameter', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_QUOTE });

    await getSwapQuote({ fromAsset: 'SOL', toAsset: 'USDC', amount: 1, onlyDirectRoutes: true });

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('onlyDirectRoutes')).toBe('true');
  });

  it('resolves asset by mint address', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_QUOTE });

    await getSwapQuote({ fromAsset: 'JUP', toAsset: 'USDT', amount: 100 });

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('inputMint')).toBe('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN');
    expect(url.searchParams.get('outputMint')).toBe('Es9vMFrzaCERmJfrF4H2FYD6jH4vM9kP7LkGEXUXMaLL');
  });

  it('throws on invalid amount', async () => {
    await expect(getSwapQuote({ fromAsset: 'SOL', toAsset: 'USDC', amount: -1 }))
      .rejects.toThrow('Swap amount must be a positive number');
  });
});

describe('getSwapTransaction', () => {
  it('posts correct request body to Jupiter swap endpoint', async () => {
    // We can't easily construct valid VersionedTransaction bytes,
    // so we test the request format and error handling instead
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ swapTransaction: 'not-a-real-tx' }),
    });

    const quote = { rawQuote: MOCK_QUOTE } as any;

    // Will throw during deserialization, but we can verify the request was correct
    try {
      await getSwapTransaction(quote, 'UserPublicKey111111111111111111111111111');
    } catch {
      // expected — invalid base64 won't deserialize
    }

    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.userPublicKey).toBe('UserPublicKey111111111111111111111111111');
    expect(body.wrapAndUnwrapSol).toBe(true);
    expect(body.dynamicComputeUnitLimit).toBe(true);
    expect(body.quoteResponse).toEqual(MOCK_QUOTE);
  });

  it('throws when Jupiter swap API fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    await expect(getSwapTransaction({ rawQuote: MOCK_QUOTE } as any, 'key'))
      .rejects.toThrow('Jupiter swap transaction request failed');
  });

  it('throws when swapTransaction is missing from response', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await expect(getSwapTransaction({ rawQuote: MOCK_QUOTE } as any, 'key'))
      .rejects.toThrow('did not include a swapTransaction');
  });
});

describe('toSwapExecutionResult', () => {
  it('adds signature and explorer URL to quote', () => {
    const quote = { fromAsset: 'SOL', toAsset: 'USDC', inAmount: 1, outAmount: 15 } as any;
    const result = toSwapExecutionResult(quote, 'tx-sig-123');

    expect(result.signature).toBe('tx-sig-123');
    expect(result.explorerUrl).toBe('https://solscan.io/tx/tx-sig-123');
    expect(result.fromAsset).toBe('SOL');
  });
});
