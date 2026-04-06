/**
 * Tool definitions for OpenAI function calling.
 * Maps SDK methods to structured tool schemas.
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const READ_TOOLS = new Set([
  'solobank_address',
  'solobank_balance',
  'solobank_swap_quote',
  'solobank_lending_rates',
]);

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // Read tools
  {
    type: 'function',
    function: {
      name: 'solobank_address',
      description: 'Get the wallet address',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_balance',
      description: 'Get SOL and USDC balances',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_swap_quote',
      description: 'Get a swap quote from Jupiter without executing',
      parameters: {
        type: 'object',
        properties: {
          fromAsset: { type: 'string', description: 'Source asset (SOL, USDC)' },
          toAsset: { type: 'string', description: 'Target asset' },
          amount: { type: 'number', description: 'Amount of source asset' },
          slippageBps: { type: 'number', description: 'Max slippage in basis points' },
        },
        required: ['fromAsset', 'toAsset', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_lending_rates',
      description: 'Get current lending rates from Kamino and Marginfi',
      parameters: {
        type: 'object',
        properties: {
          asset: { type: 'string', description: 'Asset symbol (USDC, SOL)' },
          protocol: { type: 'string', description: 'Filter: kamino, marginfi, or auto' },
        },
        required: ['asset'],
      },
    },
  },
  // Write tools
  {
    type: 'function',
    function: {
      name: 'solobank_send',
      description: 'Send SOL or USDC to an address',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient Solana address' },
          amount: { type: 'number', description: 'Amount to send' },
          asset: { type: 'string', description: 'Asset: SOL or USDC' },
          dryRun: { type: 'boolean', description: 'Preview only, no broadcast' },
        },
        required: ['to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_swap',
      description: 'Execute a token swap via Jupiter',
      parameters: {
        type: 'object',
        properties: {
          fromAsset: { type: 'string', description: 'Source asset' },
          toAsset: { type: 'string', description: 'Target asset' },
          amount: { type: 'number', description: 'Amount of source asset' },
          slippageBps: { type: 'number', description: 'Max slippage in basis points' },
        },
        required: ['fromAsset', 'toAsset', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_lend',
      description: 'Supply assets to a lending protocol to earn yield',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount to supply' },
          asset: { type: 'string', description: 'Asset symbol' },
          protocol: { type: 'string', description: 'Protocol: kamino, marginfi, or auto' },
        },
        required: ['amount', 'asset'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_borrow',
      description: 'Borrow assets against collateral',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount to borrow' },
          asset: { type: 'string', description: 'Asset symbol' },
          protocol: { type: 'string', description: 'Protocol: kamino, marginfi, or auto' },
        },
        required: ['amount', 'asset'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_withdraw',
      description: 'Withdraw supplied assets from lending',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount to withdraw' },
          asset: { type: 'string', description: 'Asset symbol' },
          protocol: { type: 'string', description: 'Protocol: kamino, marginfi, or auto' },
        },
        required: ['amount', 'asset'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_repay',
      description: 'Repay borrowed assets',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount to repay' },
          asset: { type: 'string', description: 'Asset symbol' },
          protocol: { type: 'string', description: 'Protocol: kamino, marginfi, or auto' },
        },
        required: ['amount', 'asset'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_rebalance',
      description: 'Move supply between lending protocols for better yield',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount to move' },
          asset: { type: 'string', description: 'Asset symbol' },
          targetProtocol: { type: 'string', description: 'Target protocol' },
          minApyDelta: { type: 'number', description: 'Min APY improvement (e.g. 0.5)' },
        },
        required: ['amount', 'asset'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solobank_pay',
      description: 'Pay for an MPP-protected API endpoint with USDC',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'API endpoint URL' },
          method: { type: 'string', description: 'HTTP method (default POST)' },
          body: { type: 'object', description: 'JSON request body' },
          maxPrice: { type: 'number', description: 'Max price in USD' },
        },
        required: ['url'],
      },
    },
  },
];

export interface Agent {
  address(): string;
  balance(): Promise<unknown>;
  send(input: { to: string; amount: number; asset?: string; dryRun?: boolean }): Promise<unknown>;
  swap(input: { fromAsset: string; toAsset: string; amount: number; slippageBps?: number }): Promise<unknown>;
  getSwapQuote?(input: { fromAsset: string; toAsset: string; amount: number; slippageBps?: number }): Promise<unknown>;
  getLendingRates?(input: { asset: string; protocol?: string }): Promise<unknown>;
  lend?(input: { amount: number; asset: string; protocol?: string }): Promise<unknown>;
  borrow?(input: { amount: number; asset: string; protocol?: string }): Promise<unknown>;
  withdraw?(input: { amount: number; asset: string; protocol?: string }): Promise<unknown>;
  repay?(input: { amount: number; asset: string; protocol?: string }): Promise<unknown>;
  rebalance?(input: { amount: number; asset: string; targetProtocol?: string; minApyDelta?: number }): Promise<unknown>;
  pay(input: { url: string; method?: string; body?: unknown; maxPrice?: number }): Promise<unknown>;
}

export async function executeTool(agent: Agent, name: string, args: Record<string, unknown>): Promise<string> {
  try {
    let result: unknown;
    switch (name) {
      case 'solobank_address':
        result = { address: agent.address() };
        break;
      case 'solobank_balance':
        result = await agent.balance();
        break;
      case 'solobank_swap_quote':
        result = agent.getSwapQuote ? await agent.getSwapQuote(args as any) : { error: 'Not available' };
        break;
      case 'solobank_lending_rates':
        result = agent.getLendingRates ? await agent.getLendingRates(args as any) : { error: 'Not available' };
        break;
      case 'solobank_send':
        result = await agent.send(args as any);
        break;
      case 'solobank_swap':
        result = await agent.swap(args as any);
        break;
      case 'solobank_lend':
        result = agent.lend ? await agent.lend(args as any) : { error: 'Not available' };
        break;
      case 'solobank_borrow':
        result = agent.borrow ? await agent.borrow(args as any) : { error: 'Not available' };
        break;
      case 'solobank_withdraw':
        result = agent.withdraw ? await agent.withdraw(args as any) : { error: 'Not available' };
        break;
      case 'solobank_repay':
        result = agent.repay ? await agent.repay(args as any) : { error: 'Not available' };
        break;
      case 'solobank_rebalance':
        result = agent.rebalance ? await agent.rebalance(args as any) : { error: 'Not available' };
        break;
      case 'solobank_pay':
        result = await agent.pay(args as any);
        break;
      default:
        result = { error: `Unknown tool: ${name}` };
    }
    return JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}
