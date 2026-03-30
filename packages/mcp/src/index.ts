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
}

export interface StartMcpServerOptions {
  rpcUrl?: string;
  keypairPath?: string;
  agent?: SolobankAgent;
}

function asText(payload: unknown) {
  const text = JSON.stringify(payload, (_key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  });

  return {
    content: [
      {
        type: 'text' as const,
        text,
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

async function loadAgent(options: StartMcpServerOptions): Promise<SolobankAgent> {
  if (options.agent) {
    return options.agent;
  }

  const sdk = await import('@solobank/sdk');
  const Candidate = sdk.Solobank;
  if (!Candidate) {
    throw new Error('@solobank/sdk does not export a Solobank class');
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

  throw new Error('@solobank/sdk must expose Solobank.load(...) or Solobank.create(...)');
}

export async function createMcpServer(options: StartMcpServerOptions = {}): Promise<McpServer> {
  const agent = await loadAgent(options);
  const server = new McpServer({ name: 'solobank', version: '0.1.0' });

  server.tool(
    'solobank_address',
    'Return the current Solana wallet address managed by the Solobank agent.',
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
    'solobank_balance',
    'Return the current Solana wallet balance snapshot for the Solobank agent.',
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
    'solobank_send',
    'Send SOL or SPL tokens from the Solobank wallet. Use dryRun to preview without broadcasting.',
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
    'solobank_pay',
    'Pay an MPP-protected endpoint through the Solobank wallet and return the upstream response.',
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
