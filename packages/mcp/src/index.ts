import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

export interface SolobankAgent {
  address(): string;
  balance(): Promise<unknown>;
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
  maxAmountPerTx?: number;
  maxDailySend?: number;
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

  if (typeof Candidate.load === 'function') {
    return Candidate.load({ rpcUrl: options.rpcUrl, keypairPath: options.keypairPath });
  }
  if (typeof Candidate.create === 'function') {
    return Candidate.create({ rpcUrl: options.rpcUrl, keypairPath: options.keypairPath });
  }
  throw new Error('@solobank/sdk must expose Solobank.load(...) or Solobank.create(...)');
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

// ── Safeguard integration ──

interface SafeguardState {
  locked: boolean;
  maxAmountPerTx: number;
  maxDailySend: number | null;
  dailySpent: number;
  dailyLog: Array<{ timestamp: number; amount: number }>;
}

function createSafeguardState(options: StartMcpServerOptions): SafeguardState {
  return {
    locked: false,
    maxAmountPerTx: options.maxAmountPerTx ?? 1.0,
    maxDailySend: options.maxDailySend ?? null,
    dailySpent: 0,
    dailyLog: [],
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function checkWrite(amount: number, state: SafeguardState): string | null {
  if (state.locked) return "Wallet is locked. Use 'solobank unlock' in CLI to re-enable.";
  if (amount > state.maxAmountPerTx) return `Amount ${amount} exceeds per-tx limit of ${state.maxAmountPerTx}.`;
  if (state.maxDailySend !== null) {
    const cutoff = Date.now() - DAY_MS;
    const recent = state.dailyLog.filter((e) => e.timestamp > cutoff);
    const total = recent.reduce((s, e) => s + e.amount, 0);
    if (total + amount > state.maxDailySend) return `Would exceed daily limit of ${state.maxDailySend} (sent ${total.toFixed(2)} today).`;
  }
  return null;
}

function recordSpend(amount: number, state: SafeguardState): void {
  const cutoff = Date.now() - DAY_MS;
  state.dailyLog = state.dailyLog.filter((e) => e.timestamp > cutoff);
  state.dailyLog.push({ timestamp: Date.now(), amount });
}

// ── Server factory ──

export async function createMcpServer(options: StartMcpServerOptions = {}): Promise<McpServer> {
  const agent = await loadAgent(options);
  const guard = createSafeguardState(options);
  const server = new McpServer({ name: 'solobank', version: '2.0.0' });

  // ── Read tools ──

  server.tool('solobank_address', 'Return the wallet address.', {}, async () => {
    try { return asText({ address: agent.address() }); } catch (e) { return asError(e); }
  });

  server.tool('solobank_balance', 'Return token balances (SOL, USDC, etc).', {}, async () => {
    try { return asText(await agent.balance()); } catch (e) { return asError(e); }
  });

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

  // ── Write tools (safeguard-gated) ──

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
          const err = checkWrite(amount, guard);
          if (err) return asError(new Error(err));
        }
        const result = await agent.send({ to, amount, asset, dryRun });
        if (!dryRun) recordSpend(amount, guard);
        return asText(result);
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_pay',
    'Pay an MPP-protected API endpoint and return the response.',
    {
      url: z.string().url().describe('MPP endpoint URL'),
      method: z.string().optional().describe('HTTP method (default GET)'),
      body: z.unknown().optional().describe('JSON payload'),
      maxPrice: z.number().positive().optional().describe('Max price in USDC'),
      headers: z.record(z.string(), z.string()).optional().describe('Request headers'),
    },
    async ({ url, method, body, maxPrice, headers }) => {
      try {
        if (isInternalUrl(url)) return asError(new Error('Cannot access internal URLs'));
        const price = maxPrice ?? guard.maxAmountPerTx;
        const err = checkWrite(price, guard);
        if (err) return asError(new Error(err));
        const result = await agent.pay({ url, method, body, maxPrice: price, headers });
        recordSpend(price, guard);
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
        const err = checkWrite(args.amount, guard);
        if (err) return asError(new Error(err));
        const result = await agent.swap(args);
        recordSpend(args.amount, guard);
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
        const err = checkWrite(args.amount, guard);
        if (err) return asError(new Error(err));
        const result = await agent.lend(args);
        recordSpend(args.amount, guard);
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
        const err = checkWrite(args.amount, guard);
        if (err) return asError(new Error(err));
        const result = await agent.borrow(args);
        recordSpend(args.amount, guard);
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
        return asText(await agent.rebalance(args));
      } catch (e) { return asError(e); }
    },
  );

  server.tool(
    'solobank_lock',
    'Emergency lock — disables all write operations. Can only be unlocked via CLI.',
    {},
    async () => {
      guard.locked = true;
      return asText({ locked: true, message: "Wallet locked. Run 'solobank unlock' in CLI to re-enable." });
    },
  );

  server.tool(
    'solobank_config',
    'View or update safeguard configuration (per-tx limit, daily limit).',
    {
      action: z.enum(['get', 'set']).describe("'get' to view, 'set' to update"),
      key: z.string().optional().describe('Config key: maxAmountPerTx or maxDailySend'),
      value: z.number().optional().describe('New value for the key'),
    },
    async ({ action, key, value }) => {
      if (action === 'get') {
        return asText({
          maxAmountPerTx: guard.maxAmountPerTx,
          maxDailySend: guard.maxDailySend,
          locked: guard.locked,
        });
      }
      if (key === 'maxAmountPerTx' && value !== undefined) {
        guard.maxAmountPerTx = value;
        return asText({ maxAmountPerTx: value });
      }
      if (key === 'maxDailySend' && value !== undefined) {
        guard.maxDailySend = value;
        return asText({ maxDailySend: value });
      }
      return asError(new Error("Use key 'maxAmountPerTx' or 'maxDailySend' with a numeric value."));
    },
  );

  return server;
}

export async function startMcpServer(options: StartMcpServerOptions = {}): Promise<void> {
  console.log = (...args: unknown[]) => console.error('[log]', ...args);
  console.warn = (...args: unknown[]) => console.error('[warn]', ...args);

  const server = await createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
