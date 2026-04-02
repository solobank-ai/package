# Solobank SDK

DeFi toolkit for Solana: payments, lending, swaps, and MCP server.

## Packages

| Package | Description |
|---------|-------------|
| [`@solobank/sdk`](packages/sdk) | Core SDK — wallet management, token operations, MPP payments, DeFi (lending, swaps) |
| [`@solobank/mcp`](packages/mcp) | MCP server — exposes SDK functions as tools for AI agents |

## Quick Start

```bash
pnpm install
pnpm build
```

## SDK Usage

```ts
import { Solobank } from '@solobank/sdk';

const sb = await Solobank.fromSecretKey('base58-secret-key', {
  rpcUrl: 'https://api.mainnet-beta.solana.com',
});

// Check balance
const balance = await sb.getBalance();

// Send tokens
await sb.send({ to: 'recipient', amount: 1.5, mint: 'USDC-MINT' });

// Pay for API access (MPP 402 flow)
const response = await sb.pay({ url: 'https://gateway/openai/v1/chat/completions', body: { ... } });

// DeFi: Lending
await sb.supply({ amount: 100, mint: 'USDC-MINT' });
await sb.borrow({ amount: 50, mint: 'SOL-MINT' });

// DeFi: Swaps
await sb.swap({ from: 'SOL', to: 'USDC', amount: 1 });
```

## MCP Server

The MCP server wraps the SDK for AI agent integration:

```bash
# Run directly
node packages/mcp/dist/bin.js

# Or via Docker
docker build -t solobank-mcp -f packages/mcp/Dockerfile .
docker run solobank-mcp
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get_balance` | Token balances |
| `send_token` | Transfer tokens |
| `pay` | MPP 402 payment flow |
| `swap` | Jupiter DEX swaps |
| `supply` / `borrow` | Kamino/MarginFi lending |
| `get_address` | Wallet address |

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm typecheck        # Type checking
```

## Tech Stack

- `@solana/kit` v2 + `@solana/web3.js` v1 — Solana RPC and transactions
- `@solana-program/token` — SPL token operations
- `@solobank/mpp-solana` — Machine Payments Protocol
- `@kamino-finance/klend-sdk` — Kamino lending
- `@mrgnlabs/marginfi-client-v2` — MarginFi lending
- Jupiter Aggregator — Token swaps
- `mppx` — MPP protocol client
- `changesets` — Versioning and publishing

## Monorepo Structure

```
packages/
  sdk/          # Core SDK
    src/
      index.ts    # Main Solobank class
      browser.ts  # Browser client (wallet adapter)
  mcp/          # MCP server
    src/
      bin.ts      # Entry point
      tools/      # MCP tool definitions
```

## License

MIT
