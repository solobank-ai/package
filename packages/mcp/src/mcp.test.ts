import { beforeEach, describe, expect, it, vi } from 'vitest';

const toolMap = new Map<string, (args: any) => Promise<any>>();
const connectMock = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: vi.fn((name: string, _description: string, _schema: unknown, handler: (args: any) => Promise<any>) => {
      toolMap.set(name, handler);
    }),
    connect: connectMock,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({ kind: 'stdio' })),
}));

describe('solobank mcp server', () => {
  const agent = {
    address: vi.fn(() => 'So11111111111111111111111111111111111111112'),
    balance: vi.fn(async () => ({ network: 'solana', sol: 1.25, usdc: 12.5 })),
    send: vi.fn(async (input: unknown) => ({ ok: true, action: 'send', input })),
    pay: vi.fn(async (input: unknown) => ({ ok: true, action: 'pay', input })),
  };

  beforeEach(() => {
    toolMap.clear();
    connectMock.mockReset();
    vi.clearAllMocks();
  });

  it('registers the compact toolset and routes calls into the agent', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent, maxAmountPerTx: 100 });

    expect([...toolMap.keys()].sort()).toEqual([
      'solobank_address',
      'solobank_balance',
      'solobank_pay',
      'solobank_send',
    ]);

    const address = await toolMap.get('solobank_address')!({});
    const balance = await toolMap.get('solobank_balance')!({});
    const send = await toolMap.get('solobank_send')!({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS',
      amount: 2,
      asset: 'USDC',
      dryRun: true,
    });
    const pay = await toolMap.get('solobank_pay')!({
      url: 'https://example.com/protected',
      method: 'POST',
      body: { prompt: 'hello' },
      maxPrice: 0.05,
    });

    expect(JSON.parse(address.content[0].text)).toEqual({
      address: 'So11111111111111111111111111111111111111112',
    });
    expect(JSON.parse(balance.content[0].text)).toEqual({
      network: 'solana',
      sol: 1.25,
      usdc: 12.5,
    });
    expect(agent.send).toHaveBeenCalledWith({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS',
      amount: 2,
      asset: 'USDC',
      dryRun: true,
    });
    expect(agent.pay).toHaveBeenCalledWith({
      url: 'https://example.com/protected',
      method: 'POST',
      body: { prompt: 'hello' },
      maxPrice: 0.05,
      headers: undefined,
    });
    expect(JSON.parse(send.content[0].text)).toMatchObject({ ok: true, action: 'send' });
    expect(JSON.parse(pay.content[0].text)).toMatchObject({ ok: true, action: 'pay' });
  });

  it('starts stdio transport with the created server', async () => {
    const { startMcpServer } = await import('./index.js');
    await startMcpServer({ agent });
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('serializes bigint values in tool responses', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({
      agent: {
        ...agent,
        balance: vi.fn(async () => ({
          network: 'solana',
          sol: 1.25,
          usdc: 12.5,
          solRaw: 1250000000n,
          usdcRaw: 12500000n,
        })),
      },
    });

    const balance = await toolMap.get('solobank_balance')!({});
    expect(JSON.parse(balance.content[0].text)).toEqual({
      network: 'solana',
      sol: 1.25,
      usdc: 12.5,
      solRaw: '1250000000',
      usdcRaw: '12500000',
    });
  });

  // ── New tests ──

  it('rejects send with invalid Solana address', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent, maxAmountPerTx: 100 });

    const result = await toolMap.get('solobank_send')!({
      to: 'not-a-valid-address!!!',
      amount: 1,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain('Invalid recipient address');
  });

  it('rejects send exceeding maxAmountPerTx', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent, maxAmountPerTx: 5 });

    const result = await toolMap.get('solobank_send')!({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS',
      amount: 10,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain('exceeds per-transaction limit');
  });

  it('uses default maxAmountPerTx of 1.0 when not specified', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent });

    const result = await toolMap.get('solobank_send')!({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS',
      amount: 2,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain('exceeds per-transaction limit of 1');
  });

  it('rejects pay to internal/private network URLs', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent, maxAmountPerTx: 100 });

    const internalUrls = [
      'http://127.0.0.1:8080/api',
      'http://10.0.0.1/secret',
      'http://192.168.1.1/admin',
      'http://172.16.0.1/internal',
      'http://localhost:3000/api',
      'http://[::1]:8080/api',
    ];

    for (const url of internalUrls) {
      const result = await toolMap.get('solobank_pay')!({ url });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).error).toContain('internal/private network');
    }
  });

  it('allows pay to external URLs', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent, maxAmountPerTx: 100 });

    const result = await toolMap.get('solobank_pay')!({
      url: 'https://api.example.com/v1/chat',
    });

    expect(result.isError).toBeUndefined();
    expect(agent.pay).toHaveBeenCalled();
  });

  it('handles agent errors gracefully in send', async () => {
    const failingAgent = {
      ...agent,
      send: vi.fn().mockRejectedValue(new Error('Insufficient SOL balance')),
    };

    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent: failingAgent, maxAmountPerTx: 100 });

    const result = await toolMap.get('solobank_send')!({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS',
      amount: 1,
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain('Insufficient SOL balance');
  });

  it('handles agent errors gracefully in balance', async () => {
    const failingAgent = {
      ...agent,
      balance: vi.fn().mockRejectedValue(new Error('RPC timeout')),
    };

    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent: failingAgent });

    const result = await toolMap.get('solobank_balance')!({});

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain('RPC timeout');
  });

  it('handles agent errors gracefully in pay', async () => {
    const failingAgent = {
      ...agent,
      pay: vi.fn().mockRejectedValue(new Error('MPP price 5 exceeds maxPrice 1')),
    };

    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent: failingAgent, maxAmountPerTx: 100 });

    const result = await toolMap.get('solobank_pay')!({
      url: 'https://api.example.com/expensive',
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toContain('exceeds maxPrice');
  });

  it('passes headers to agent pay call', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent, maxAmountPerTx: 100 });

    await toolMap.get('solobank_pay')!({
      url: 'https://api.example.com/v1/chat',
      headers: { 'x-custom': 'value' },
    });

    expect(agent.pay).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { 'x-custom': 'value' } }),
    );
  });

  it('defaults maxPrice to maxAmountPerTx in pay', async () => {
    const { createMcpServer } = await import('./index.js');
    await createMcpServer({ agent, maxAmountPerTx: 42 });

    await toolMap.get('solobank_pay')!({
      url: 'https://api.example.com/v1/chat',
    });

    expect(agent.pay).toHaveBeenCalledWith(
      expect.objectContaining({ maxPrice: 42 }),
    );
  });
});
