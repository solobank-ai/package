/**
 * Engine HTTP server — POST /chat with SSE streaming.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { QueryEngine } from './engine.js';

const PORT = Number(process.env.PORT ?? 3003);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required');
  process.exit(1);
}

// Create a mock agent for now — in production, use Solobank SDK
const mockAgent = {
  address: () => process.env.SOLOBANK_ADDRESS ?? 'not-configured',
  balance: async () => ({ sol: 0, usdc: 0 }),
  send: async () => ({ error: 'Not configured — connect wallet' }),
  swap: async () => ({ error: 'Not configured' }),
  pay: async () => ({ error: 'Not configured' }),
};

// Try to load real SDK agent
async function loadAgent() {
  try {
    const sdk = await import('@solobank/sdk');
    if (process.env.SOLOBANK_PRIVATE_KEY) {
      const agent = await sdk.Solobank.fromSecretKey(process.env.SOLOBANK_PRIVATE_KEY, {
        rpcUrl: process.env.SOLOBANK_RPC_URL,
      });
      console.log(`Agent loaded: ${agent.address()}`);
      return agent;
    }
    if (process.env.SOLOBANK_KEYPAIR_PATH) {
      const agent = await sdk.Solobank.create({
        keypairPath: process.env.SOLOBANK_KEYPAIR_PATH,
        rpcUrl: process.env.SOLOBANK_RPC_URL,
      });
      console.log(`Agent loaded: ${agent.address()}`);
      return agent;
    }
  } catch (err) {
    console.warn('SDK not available, using mock agent:', err instanceof Error ? err.message : err);
  }
  return mockAgent;
}

async function main() {
  const agent = await loadAgent();
  const engine = new QueryEngine({ apiKey: OPENAI_API_KEY!, agent: agent as any });

  const app = new Hono();

  app.use('*', cors({
    origin: ['https://solobank.lol', 'https://ai.solobank.lol', 'http://localhost:3000'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }));

  app.get('/health', (c) => c.json({ status: 'ok', engine: 'running' }));

  // Serve chat UI
  let chatHtml: string;
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    chatHtml = readFileSync(join(dir, '..', 'public', 'index.html'), 'utf-8');
  } catch {
    chatHtml = '<h1>Solobank AI</h1><p>Chat UI not found</p>';
  }
  app.get('/', (c) => c.html(chatHtml));

  app.post('/chat', async (c) => {
    const body = await c.req.json<{ sessionId?: string; message: string }>().catch(() => null);

    if (!body?.message) {
      return c.json({ error: 'message is required' }, 400);
    }

    const sessionId = body.sessionId ?? crypto.randomUUID();

    return streamSSE(c, async (stream) => {
      for await (const event of engine.query(sessionId, body.message)) {
        await stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
        });
      }
    });
  });

  console.log(`Solobank Engine running on http://localhost:${PORT}`);
  serve({ fetch: app.fetch, port: PORT });
}

main().catch(console.error);
