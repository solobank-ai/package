# Solobank

AI bank account for autonomous agents on Solana.

[![npm](https://img.shields.io/npm/v/@solobank/sdk?label=sdk)](https://www.npmjs.com/package/@solobank/sdk)
[![npm](https://img.shields.io/npm/v/@solobank/mcp?label=mcp)](https://www.npmjs.com/package/@solobank/mcp)
[![npm](https://img.shields.io/npm/v/@solobank/cli?label=cli)](https://www.npmjs.com/package/@solobank/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Monorepo containing the core SDK, MCP server, and CLI for Solobank. Agents can earn yield, borrow, swap tokens, and pay for APIs using USDC on Solana.

## Install

```bash
curl -fsSL https://solobank.lol/install.sh | bash
```

Or install individual packages:

```bash
npm install @solobank/sdk    # TypeScript SDK
npm install @solobank/mcp    # MCP server
npm install @solobank/cli    # CLI
```

## Packages

| Package | Description |
|---------|-------------|
| [`@solobank/sdk`](packages/sdk) | Core SDK -- wallet, send, pay, swap, lend, borrow, repay, rebalance |
| [`@solobank/mcp`](packages/mcp) | MCP server -- 18 tools for Claude, Cursor, Windsurf |
| [`@solobank/cli`](packages/cli) | CLI -- 14 commands with install script |

## SDK Quick Start

```ts
import { Solobank } from '@solobank/sdk';

const sb = await Solobank.fromSecretKey('base58-secret-key', {
  rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
});

// Check balance
const balance = await sb.getBalance();

// Send USDC
await sb.send({ to: 'recipient', amount: 10, mint: 'USDC' });

// Pay for an API call (MPP 402 flow)
const response = await sb.pay({
  url: 'https://mpp.solobank.lol/openai/v1/chat/completions',
  body: { model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }] },
});

// Earn yield via Kamino/Marginfi
await sb.supply({ amount: 100, mint: 'USDC' });

// Borrow against deposits
await sb.borrow({ amount: 50, mint: 'USDC' });

// Swap via Jupiter
await sb.swap({ from: 'SOL', to: 'USDC', amount: 1 });

// Rebalance to best APY
await sb.rebalance();
```

## MCP Server

The MCP server exposes the SDK as 18 tools for AI agents:

```bash
solobank mcp install   # Auto-configure for Claude/Cursor
```

### Available Tools

| Tool | Description |
|------|-------------|
| `get_balance` | Token balances (SOL, USDC, all SPL) |
| `get_address` | Wallet public key |
| `send_token` | Transfer SOL/USDC/SPL tokens |
| `pay` | MPP 402 payment flow |
| `swap` | Jupiter DEX swap |
| `supply` | Deposit to Kamino/Marginfi |
| `withdraw` | Withdraw from lending |
| `borrow` | Borrow against collateral |
| `repay` | Repay loans |
| `rebalance` | Move funds to best APY |
| `get_services` | List MPP gateway services |
| `get_stats` | Payment statistics |
| `get_positions` | Lending positions |
| `get_health` | Account health factor |
| `set_limit` | Set spending limits |
| `lock` | Lock agent spending |
| `unlock` | Unlock agent spending |
| `get_safeguards` | View current limits |

## CLI

```bash
solobank init               # Create wallet + config
solobank balance            # Check balances
solobank send 10 USDC to <address>
solobank swap 1 SOL to USDC
solobank save 100 USDC      # Deposit to savings
solobank borrow 50 USDC     # Borrow against deposits
solobank repay 50 USDC      # Repay loan
solobank mcp install        # Install MCP server
```

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm typecheck        # Type checking
```

## Tech Stack

- **Solana**: `@solana/kit` v2, `@solana/web3.js` v1, `@solana-program/token`
- **DeFi**: Kamino (`@kamino-finance/klend-sdk`), Marginfi (`@mrgnlabs/marginfi-client-v2`)
- **Swaps**: Jupiter Aggregator
- **Payments**: MPP protocol (`mppx`, `@solobank/mpp-solana`)
- **RPC**: Helius
- **Build**: pnpm workspaces, changesets

## Monorepo Structure

```
packages/
  sdk/           # Core SDK (@solobank/sdk)
    src/
      index.ts     # Solobank class
      browser.ts   # Browser client (wallet adapter)
  mcp/           # MCP server (@solobank/mcp)
    src/
      bin.ts       # Entry point
      tools/       # Tool definitions
  cli/           # CLI (@solobank/cli)
    src/
      commands/    # CLI commands
```

## Related Repos

- [solobank-ai/backend](https://github.com/solobank-ai/backend) -- MPP payment gateway
- [solobank-ai/mpp-solana](https://github.com/solobank-ai/mpp-solana) -- Solana MPP payment method
- [solobank-ai/solobank_frontend](https://github.com/solobank-ai/solobank_frontend) -- Website (solobank.lol)
- [solobank-ai/solobank-skills](https://github.com/solobank-ai/solobank-skills) -- Agent skills
- [solobank-ai/contracts](https://github.com/solobank-ai/contracts) -- Solana programs

## License

MIT
