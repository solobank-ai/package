import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registerPrompts } from './prompts.js';

export interface SolobankAgent {
  address(): string;
  balance(): Promise<unknown>;
  enforcer: {
    check(metadata: { operation: string; amount?: number }): void;
    assertNotLocked(): void;
    recordUsage(amount: number): void;
    lock(): void;
    unlock(): void;
    set(key: string, value: unknown): void;
    getConfig(): { locked: boolean; maxPerTx: number; maxDailySend: number; dailyUsed: number };
    isConfigured(): boolean;
  };
  send(input: {
    to: string;
    amount: number;
    asset?: string;
    dryRun?: boolean;
  }): Promise<unknown>;
  pay(input: {
    url: string;
    method?: string;
    body?: unknown;
    maxPrice?: number;
    headers?: Record<string, string>;
  }): Promise<unknown>;
  getSwapQuote?(input: {
    fromAsset: string;
    toAsset: string;
    amount: number;
    slippageBps?: number;
  }): Promise<unknown>;
  swap?(input: {
    fromAsset: string;
    toAsset: string;
    amount: number;
    slippageBps?: number;
  }): Promise<unknown>;
  getLendingRates?(input: {
    asset: string;
    protocol?: string;
  }): Promise<unknown>;
  lend?(input: {
    amount: number;
    asset: string;
    protocol?: string;
  }): Promise<unknown>;
  borrow?(input: {
    amount: number;
    asset: string;
    protocol?: string;
  }): Promise<unknown>;
  withdraw?(input: {
    amount: number;
    asset: string;
    protocol?: string;
  }): Promise<unknown>;
  repay?(input: {
    amount: number;
    asset: string;
    protocol?: string;
  }): Promise<unknown>;
  rebalance?(input: {
    amount: number;
    asset: string;
    protocol?: string;
    targetProtocol?: string;
    minApyDelta?: number;
  }): Promise<unknown>;
}

export interface StartMcpServerOptions {
  rpcUrl?: string;
  keypairPath?: string;
  agent?: SolobankAgent;
  configPath?: string;
}

// ── Helpers ──

function asText(payload: unknown) {
  const text = JSON.stringify(payload, (_key, value) => {
    if (typeof value === 'bigint') return value.toString();
    return value;
  });
  return { content: [{ type: 'text' as const, text }] };
}

function asError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }] };
}

async function loadAgent(options: StartMcpServerOptions): Promise<SolobankAgent> {
  if (options.agent) return options.agent;

  const sdk = await import('@solobank/sdk');
  const Candidate = sdk.Solobank;
  if (!Candidate) throw new Error('@solobank/sdk does not export a Solobank class');

  let agent: any;
  if (typeof Candidate.load === 'function') {
    agent = await Candidate.load({ rpcUrl: options.rpcUrl, keypairPath: options.keypairPath });
  } else if (typeof Candidate.create === 'function') {
    agent = await Candidate.create({ rpcUrl: options.rpcUrl, keypairPath: options.keypairPath });
  } else {
    throw new Error('@solobank/sdk must expose Solobank.load(...) or Solobank.create(...)');
  }
  return agent as SolobankAgent;
}

function isInternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|localhost|\[::1\])/.test(parsed.hostname);
  } catch {
    return true;
  }
}

function isValidSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

// ── Server factory ──

export async function createMcpServer(options: StartMcpServerOptions = {}): Promise<McpServer> {
  const agent = await loadAgent(options);
  const server = new McpServer({ name: 'solobank', version: '2.0.0' });

  registerPrompts(server);

  // ── Read tools ──

  server.tool('solobank_address', 'Return the wallet address.', {}, async () => {
    try { return asText({ address: agent.address() }); } catch (e) { return asError(e); }
  });

  server.tool('solobank_balance', 'Return token balances (SOL, USDC, etc).', {}, async () => {
    try { return asText(await agent.balance()); } catch (e) { return asError(e); }
  });

  server.tool(
    'solobank_services',
    'List all available MPP-protected API services on the Solobank gateway (https://mpp.solobank.lol). Returns service names, endpoints, and pricing.',
    {},
    async () => {
      try {
        const res = await fetch('https://mpp.solobank.lol/services');
        if (!res.ok) throw new Error(`Failed to fetch services: ${res.status}`);
        return asText(await res.json());
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_swap_quote',
    'Get a swap quote from Jupiter without executing. Read-only.',
    {
      fromAsset: z.string().describe('Source asset (SOL, USDC, or mint address)'),
      toAsset: z.string().describe('Target asset'),
      amount: z.number().positive().describe('Amount of source asset'),
      slippageBps: z.number().int().optional().describe('Max slippage in basis points'),
    },
    async (args) => {
      try {
        if (!agent.getSwapQuote) return asError(new Error('Swap not available'));
        return asText(await agent.getSwapQuote(args));
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_lending_rates',
    'Query current lending/borrowing rates from Kamino and Marginfi. Read-only.',
    {
      asset: z.string().describe('Asset symbol (USDC, SOL, etc)'),
      protocol: z.string().optional().describe('Filter by protocol: kamino, marginfi, or auto'),
    },
    async (args) => {
      try {
        if (!agent.getLendingRates) return asError(new Error('Lending not available'));
        return asText(await agent.getLendingRates(args));
      } catch (e) { return asError(e); }
    },
  );

  // ── Write tools (safeguard-gated via agent.enforcer) ──

  server.tool(
    'solobank_send',
    'Send SOL or SPL tokens. Use dryRun to preview.',
    {
      to: z.string().describe('Recipient Solana address'),
      amount: z.number().positive().describe('Amount in asset units'),
      asset: z.string().optional().describe('Asset symbol (SOL, USDC)'),
      dryRun: z.boolean().optional().describe('Preview only, no broadcast'),
    },
    async ({ to, amount, asset, dryRun }) => {
      try {
        if (!isValidSolanaAddress(to)) return asError(new Error('Invalid address format'));
        if (!dryRun) {
          agent.enforcer.check({ operation: 'send', amount });
        }
        const result = await agent.send({ to, amount, asset, dryRun });
        if (!dryRun) agent.enforcer.recordUsage(amount);
        return asText(result);
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_pay',
    'Pay an MPP-protected API endpoint and return the response. Gateway: https://mpp.solobank.lol — example: https://mpp.solobank.lol/openai/v1/chat/completions',
    {
      url: z.string().url().describe('MPP endpoint URL, e.g. https://mpp.solobank.lol/openai/v1/chat/completions'),
      method: z.string().optional().describe('HTTP method (default GET)'),
      body: z.unknown().optional().describe('JSON payload'),
      maxPrice: z.number().positive().optional().describe('Max price in USDC'),
      headers: z.record(z.string(), z.string()).optional().describe('Request headers'),
    },
    async ({ url, method, body, maxPrice, headers }) => {
      try {
        if (isInternalUrl(url)) return asError(new Error('Cannot access internal URLs'));
        const price = maxPrice ?? 1;
        agent.enforcer.check({ operation: 'pay', amount: price });
        const result = await agent.pay({ url, method, body, maxPrice: price, headers });
        agent.enforcer.recordUsage(price);
        return asText(result);
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_swap',
    'Execute a token swap via Jupiter aggregator.',
    {
      fromAsset: z.string().describe('Source asset'),
      toAsset: z.string().describe('Target asset'),
      amount: z.number().positive().describe('Amount of source asset'),
      slippageBps: z.number().int().optional().describe('Max slippage in basis points'),
    },
    async (args) => {
      try {
        if (!agent.swap) return asError(new Error('Swap not available'));
        agent.enforcer.assertNotLocked();
        const result = await agent.swap(args);
        return asText(result);
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_lend',
    'Supply assets to a lending protocol (Kamino or Marginfi) to earn yield.',
    {
      amount: z.number().positive().describe('Amount to supply'),
      asset: z.string().describe('Asset symbol'),
      protocol: z.string().optional().describe('Protocol: kamino, marginfi, or auto'),
    },
    async (args) => {
      try {
        if (!agent.lend) return asError(new Error('Lending not available'));
        agent.enforcer.assertNotLocked();
        const result = await agent.lend(args);
        return asText(result);
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_borrow',
    'Borrow assets against collateral from a lending protocol.',
    {
      amount: z.number().positive().describe('Amount to borrow'),
      asset: z.string().describe('Asset symbol'),
      protocol: z.string().optional().describe('Protocol: kamino, marginfi, or auto'),
    },
    async (args) => {
      try {
        if (!agent.borrow) return asError(new Error('Borrowing not available'));
        agent.enforcer.assertNotLocked();
        const result = await agent.borrow(args);
        return asText(result);
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_withdraw',
    'Withdraw supplied assets from a lending protocol.',
    {
      amount: z.number().positive().describe('Amount to withdraw'),
      asset: z.string().describe('Asset symbol'),
      protocol: z.string().optional().describe('Protocol: kamino, marginfi, or auto'),
    },
    async (args) => {
      try {
        if (!agent.withdraw) return asError(new Error('Withdraw not available'));
        agent.enforcer.assertNotLocked();
        return asText(await agent.withdraw(args));
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_repay',
    'Repay borrowed assets to a lending protocol.',
    {
      amount: z.number().positive().describe('Amount to repay'),
      asset: z.string().describe('Asset symbol'),
      protocol: z.string().optional().describe('Protocol: kamino, marginfi, or auto'),
    },
    async (args) => {
      try {
        if (!agent.repay) return asError(new Error('Repay not available'));
        agent.enforcer.assertNotLocked();
        return asText(await agent.repay(args));
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_rebalance',
    'Move supply from one lending protocol to another for better yield.',
    {
      amount: z.number().positive().describe('Amount to move'),
      asset: z.string().describe('Asset symbol'),
      protocol: z.string().optional().describe('Source protocol'),
      targetProtocol: z.string().optional().describe('Target protocol'),
      minApyDelta: z.number().optional().describe('Min APY improvement to proceed (e.g. 0.5 = 0.5%)'),
    },
    async (args) => {
      try {
        if (!agent.rebalance) return asError(new Error('Rebalance not available'));
        agent.enforcer.assertNotLocked();
        return asText(await agent.rebalance(args));
      } catch (e) { return asError(e); }
    },
  );

  // ── Safety tools ──

  server.tool(
    'solobank_lock',
    'Freeze all agent operations immediately. Only a human can unlock via `solobank unlock` in the terminal. Use this as an emergency stop.',
    {},
    async () => {
      try {
        agent.enforcer.lock();
        return asText({
          locked: true,
          message: 'Agent locked. Only a human can unlock via: solobank unlock',
        });
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_config',
    'View or set agent safeguard limits (per-transaction max, daily send limit). Use action "show" to view current limits, "set" to update. Values are in dollars. Set to 0 for unlimited.',
    {
      action: z.enum(['show', 'set']).describe('"show" to view current limits, "set" to update a limit'),
      key: z.string().optional().describe('Setting to update: "maxPerTx" or "maxDailySend"'),
      value: z.number().optional().describe('New value in dollars (0 = unlimited)'),
    },
    async ({ action, key, value }) => {
      try {
        if (action === 'show') {
          const config = agent.enforcer.getConfig();
          return asText({
            locked: config.locked,
            maxPerTx: config.maxPerTx,
            maxDailySend: config.maxDailySend,
            dailyUsed: config.dailyUsed,
          });
        }

        if (!key || value === undefined) {
          return asError(new Error('Both "key" and "value" are required for action "set"'));
        }

        if (key === 'locked') {
          return asError(new Error('Cannot set "locked" via config. Use solobank_lock to freeze operations.'));
        }

        if (key !== 'maxPerTx' && key !== 'maxDailySend') {
          return asError(new Error(`Unknown key "${key}". Valid keys: "maxPerTx", "maxDailySend"`));
        }

        if (value < 0) {
          return asError(new Error('Value must be a non-negative number'));
        }

        agent.enforcer.set(key, value);
        return asText({ updated: true, key, value });
      } catch (e) { return asError(e); }
    },
  );

  return server;
}

export async function startMcpServer(options: StartMcpServerOptions = {}): Promise<void> {
  console.log = (...args: unknown[]) => console.error('[log]', ...args);
  console.warn = (...args: unknown[]) => console.error('[warn]', ...args);

  const agent = await loadAgent(options);

  if (!agent.enforcer.isConfigured()) {
    console.error(
      'Safeguards not configured. Set limits before starting MCP:\n' +
      '  solobank config set maxPerTx 100\n' +
      '  solobank config set maxDailySend 500\n',
    );
    process.exit(1);
  }

  const server = await createMcpServer({ ...options, agent });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
