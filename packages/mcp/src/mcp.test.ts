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

describe('banka mcp server', () => {
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
    await createMcpServer({ agent });

    expect([...toolMap.keys()].sort()).toEqual([
      'banka_address',
      'banka_balance',
      'banka_pay',
      'banka_send',
    ]);

    const address = await toolMap.get('banka_address')!({});
    const balance = await toolMap.get('banka_balance')!({});
    const send = await toolMap.get('banka_send')!({
      to: '9xQeWvG816bUx9EPfEZsM5qadwG4m1K4vK6TfGsDz3jS',
      amount: 2,
      asset: 'USDC',
      dryRun: true,
    });
    const pay = await toolMap.get('banka_pay')!({
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
});
