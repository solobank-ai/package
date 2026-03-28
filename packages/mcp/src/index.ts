import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

export interface BankaAgent {
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
}

export interface StartMcpServerOptions {
  rpcUrl?: string;
  keypairPath?: string;
  agent?: BankaAgent;
}

function asText(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

function asError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: message }),
      },
    ],
  };
}

async function loadAgent(options: StartMcpServerOptions): Promise<BankaAgent> {
  if (options.agent) {
    return options.agent;
  }

  const sdk = await import('@banka/sdk');
  const Candidate = sdk.Banka;
  if (!Candidate) {
    throw new Error('@banka/sdk does not export a Banka class');
  }

  if (typeof Candidate.load === 'function') {
    return Candidate.load({
      rpcUrl: options.rpcUrl,
      keypairPath: options.keypairPath,
    });
  }

  if (typeof Candidate.create === 'function') {
    return Candidate.create({
      rpcUrl: options.rpcUrl,
      keypairPath: options.keypairPath,
    });
  }

  throw new Error('@banka/sdk must expose Banka.load(...) or Banka.create(...)');
}

export async function createMcpServer(options: StartMcpServerOptions = {}): Promise<McpServer> {
  const agent = await loadAgent(options);
  const server = new McpServer({ name: 'banka', version: '0.1.0' });

  server.tool(
    'banka_address',
    'Return the current Solana wallet address managed by the Banka agent.',
    {},
    async () => {
      try {
        return asText({
          address: agent.address(),
        });
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.tool(
    'banka_balance',
    'Return the current Solana wallet balance snapshot for the Banka agent.',
    {},
    async () => {
      try {
        return asText(await agent.balance());
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.tool(
    'banka_send',
    'Send SOL or SPL tokens from the Banka wallet. Use dryRun to preview without broadcasting.',
    {
      to: z.string().describe('Recipient Solana address'),
      amount: z.number().positive().describe('Amount to send in asset units'),
      asset: z.string().optional().describe('Asset symbol, for example SOL or USDC'),
      dryRun: z.boolean().optional().describe('If true, preview only'),
    },
    async ({ to, amount, asset, dryRun }) => {
      try {
        return asText(
          await agent.send({
            to,
            amount,
            asset,
            dryRun,
          }),
        );
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.tool(
    'banka_pay',
    'Pay an MPP-protected endpoint through the Banka wallet and return the upstream response.',
    {
      url: z.string().url().describe('MPP-protected endpoint URL'),
      method: z.string().optional().describe('HTTP method, default GET'),
      body: z.unknown().optional().describe('Optional JSON payload'),
      maxPrice: z.number().positive().optional().describe('Maximum accepted price in USDC'),
      headers: z.record(z.string(), z.string()).optional().describe('Optional request headers'),
    },
    async ({ url, method, body, maxPrice, headers }) => {
      try {
        return asText(
          await agent.pay({
            url,
            method,
            body,
            maxPrice,
            headers,
          }),
        );
      } catch (error) {
        return asError(error);
      }
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
