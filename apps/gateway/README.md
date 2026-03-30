# Solobank Gateway

Headless x402 gateway for paid API proxying on Solana.

## What it does

- returns `402 Payment Required` for protected routes
- accepts Solana USDC payments through `solobank`
- verifies payment receipts through Solana RPC
- proxies paid requests to upstream APIs
- logs successful payments to a local JSONL file
- exposes a service catalog at `/api/services`

## Routes

- `GET /api/services`
- `GET /api/mpp/payments`
- `GET /api/mpp/stats`
- `POST /:service/...`

Examples:

- `POST /openai/v1/chat/completions`
- `POST /anthropic/v1/messages`
- `POST /gemini/v1beta/models/gemini-2.5-flash`
- `POST /brave/v1/web/search`
- `POST /firecrawl/v1/scrape`

## Required env

```bash
SOLOBANK_GATEWAY_RECIPIENT=<your-solana-wallet>
SOLOBANK_RPC_URL=https://api.mainnet-beta.solana.com
```

Optional:

```bash
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
SOLOBANK_GATEWAY_LOG_FILE=/tmp/solobank-gateway/mpp-payments.jsonl
OPENAI_API_KEY=<openai-key>
ANTHROPIC_API_KEY=<anthropic-key>
ANTHROPIC_VERSION=2023-06-01
```

Each upstream provider still needs its own server-side API key.
`x402` removes client keys and replaces them with per-request payment,
but the gateway still authenticates to OpenAI, Anthropic, Gemini, and the rest.

## Default MVP providers

Enabled by default:

- `openai`
- `anthropic`
- `gemini`
- `firecrawl`
- `brave`

The wider upstream registry is still in code, but disabled by the allowlist in
[lib/routes.ts](/home/user/Projects/decentrathon/package/apps/gateway/lib/routes.ts).

## Run

```bash
pnpm install
pnpm --filter @solobank/gateway dev
```

## Verify

```bash
pnpm --filter @solobank/gateway typecheck
pnpm --filter @solobank/gateway test
pnpm --filter @solobank/gateway build
```
