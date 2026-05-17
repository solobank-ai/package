import { beforeEach, describe, expect, it, vi } from 'vitest';

const toolMap = new Map<string, (args: any) => Promise<any>>();
const connectMock = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (args: any) => Promise<any>) => {
      toolMap.set(name, handler);
    }),
    prompt: vi.fn(),
    connect: connectMock,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({ kind: 'stdio' })),
}));

describe('solobank mcp server', () => {
  const enforcerState = { locked: false, maxPerTx: 100, maxDailySend: 500, dailyUsed: 0 };
  const agent = {
    address: vi.fn(() => 'So11111111111111111111111111111111111111112'),
    balance: vi.fn(async () => ({ network: 'solana', sol: 1.25, usdc: 12.5 })),
    enforcer: {
      check: vi.fn((metadata: { operation: string; amount?: number }) => {
        if (enforcerState.locked) throw new Error('Agent is locked. All operations are frozen.');
        if (metadata.operation === 'send' || metadata.operation === 'pay') {
          if (metadata.amount !== undefined && metadata.amount > enforcerState.maxPerTx) {
            throw new Error(`Amount ${metadata.amount} exceeds per-tx limit`);
          }
        }
      }),
      assertNotLocked: vi.fn(() => {
        if (enforcerState.locked) throw new Error('Agent is locked. All operations are frozen.');
      }),
      recordUsage: vi.fn((amount: number) => { enforcerState.dailyUsed += amount; }),
      lock: vi.fn(() => { enforcerState.locked = true; }),
      unlock: vi.fn(() => { enforcerState.locked = false; }),
      set: vi.fn((key: string, value: unknown) => {
        if (key === 'maxPerTx' && typeof value === 'number') enforcerState.maxPerTx = value;
        if (key === 'maxDailySend' && typeof value === 'number') enforcerState.maxDailySend = value;
      }),
      getConfig: vi.fn(() => ({ ...enforcerState })),
      isConfigured: vi.fn(() => true),
    },
    send: vi.fn(async (input: unknown) => ({ ok: true, action: 'send', input })),
    pay: vi.fn(async (input: unknown) => ({ ok: true, action: 'pay', input })),
    getSwapQuote: vi.fn(async (input: unknown) => ({ ok: true, action: 'quote', input })),
    swap: vi.fn(async (input: unknown) => ({ ok: true, action: 'swap', input })),
    getLendingRates: vi.fn(async (input: unknown) => ({ ok: true, action: 'rates', input })),
    lend: vi.fn(async (input: unknown) => ({ ok: true, action: 'lend', input })),
    borrow: vi.fn(async (input: unknown) => ({ ok: true, action: 'borrow', input })),
    withdraw: vi.fn(async (input: unknown) => ({ ok: true, action: 'withdraw', input })),
    repay: vi.fn(async (input: unknown) => ({ ok: true, action: 'repay', input })),
    rebalance: vi.fn(async (input: unknown) => ({ ok: true, action: 'rebalance', input })),
  };

  beforeEach(() => {
    toolMap.clear();
    connectMock.mockReset();
    vi.clearAllMocks();
  });

  it('registers all 15 tools', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    expect([...toolMap.keys()].sort()).toEqual([
      'solobank_address',
      'solobank_balance',
      'solobank_borrow',
      'solobank_config',
      'solobank_lend',
      'solobank_lending_rates',
      'solobank_lock',
      'solobank_pay',
      'solobank_rebalance',
      'solobank_repay',
      'solobank_send',
      'solobank_services',
      'solobank_swap',
      'solobank_swap_quote',
      'solobank_withdraw',
    ]);
  });

  it('routes address and balance calls', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    const address = await toolMap.get('solobank_address')!({});
    expect(JSON.parse(address.content[0].text).address).toBe('So11111111111111111111111111111111111111112');

    const balance = await toolMap.get('solobank_balance')!({});
    expect(JSON.parse(balance.content[0].text)).toEqual({ network: 'solana', sol: 1.25, usdc: 12.5 });
  });

  it('routes swap_quote (read-only, no safeguard check)', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent }); // read-only tests don't need limits

    const result = await toolMap.get('solobank_swap_quote')!({
      fromAsset: 'SOL', toAsset: 'USDC', amount: 1000, // over limit but read-only
    });
    expect(result.isError).toBeUndefined();
    expect(agent.getSwapQuote).toHaveBeenCalled();
  });

  it('routes lending_rates (read-only)', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    await toolMap.get('solobank_lending_rates')!({ asset: 'USDC' });
    expect(agent.getLendingRates).toHaveBeenCalledWith({ asset: 'USDC' });
  });

  it('routes send and enforces safeguards', async () => {
    const { createMcpServer } = await import('./index.js');
    enforcerState.maxPerTx = 5;
    await createMcpServer({ agent });

    const ok = await toolMap.get('solobank_send')!({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS', amount: 2,
    });
    expect(ok.isError).toBeUndefined();

    const fail = await toolMap.get('solobank_send')!({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS', amount: 10,
    });
    expect(fail.isError).toBe(true);
    expect(JSON.parse(fail.content[0].text).error).toContain('per-tx limit');
    enforcerState.maxPerTx = 100;
  });

  it('routes swap and enforces safeguards', async () => {
    const { createMcpServer } = await import('./index.js');
    enforcerState.locked = true;
    await createMcpServer({ agent });

    const fail = await toolMap.get('solobank_swap')!({
      fromAsset: 'SOL', toAsset: 'USDC', amount: 10,
    });
    expect(fail.isError).toBe(true);
    enforcerState.locked = false;
  });

  it('routes lend, borrow, withdraw, repay, rebalance', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    await toolMap.get('solobank_lend')!({ amount: 5, asset: 'USDC' });
    expect(agent.lend).toHaveBeenCalledWith({ amount: 5, asset: 'USDC' });

    await toolMap.get('solobank_borrow')!({ amount: 3, asset: 'SOL' });
    expect(agent.borrow).toHaveBeenCalledWith({ amount: 3, asset: 'SOL' });

    await toolMap.get('solobank_withdraw')!({ amount: 2, asset: 'USDC' });
    expect(agent.withdraw).toHaveBeenCalledWith({ amount: 2, asset: 'USDC' });

    await toolMap.get('solobank_repay')!({ amount: 1, asset: 'SOL' });
    expect(agent.repay).toHaveBeenCalledWith({ amount: 1, asset: 'SOL' });

    await toolMap.get('solobank_rebalance')!({ amount: 10, asset: 'USDC', targetProtocol: 'kamino' });
    expect(agent.rebalance).toHaveBeenCalledWith({ amount: 10, asset: 'USDC', targetProtocol: 'kamino' });
  });

  it('lock disables all write operations', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    // Lock
    const lockResult = await toolMap.get('solobank_lock')!({});
    expect(JSON.parse(lockResult.content[0].text).locked).toBe(true);

    // Write tools should fail
    const send = await toolMap.get('solobank_send')!({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS', amount: 1,
    });
    expect(send.isError).toBe(true);
    expect(JSON.parse(send.content[0].text).error).toContain('locked');

    // Read tools should still work
    const balance = await toolMap.get('solobank_balance')!({});
    expect(balance.isError).toBeUndefined();
  });

  it('config get/set works', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    const getResult = await toolMap.get('solobank_config')!({ action: 'show' });
    const cfg = JSON.parse(getResult.content[0].text);
    expect(cfg.maxPerTx).toBeGreaterThan(0);

    await toolMap.get('solobank_config')!({ action: 'set', key: 'maxPerTx', value: 50 });
    const getResult2 = await toolMap.get('solobank_config')!({ action: 'show' });
    expect(JSON.parse(getResult2.content[0].text).maxPerTx).toBe(50);
  });

  it('rejects invalid address in send', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    const result = await toolMap.get('solobank_send')!({ to: 'bad!!!', amount: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain('Invalid address');
  });

  it('rejects internal URLs in pay', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    for (const url of ['http://127.0.0.1/api', 'http://localhost:3000', 'http://10.0.0.1/x']) {
      const result = await toolMap.get('solobank_pay')!({ url });
      expect(result.isError).toBe(true);
    }
  });

  it('serializes bigint values', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({
      agent: { ...agent, balance: vi.fn(async () => ({ solRaw: 1250000000n })) },
    });

    const balance = await toolMap.get('solobank_balance')!({});
    expect(JSON.parse(balance.content[0].text).solRaw).toBe('1250000000');
  });

  it('starts stdio transport', async () => {
    const { startMcpServer } = await import('./index.js');
    await startMcpServer({ agent });
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
