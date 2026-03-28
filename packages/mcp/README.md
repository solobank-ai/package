# @banka/mcp

Minimal MCP server for a `@banka/sdk` agent on Solana.

The package keeps the scope deliberately small:
- `banka_address`
- `banka_balance`
- `banka_send`
- `banka_pay`

The package uses stdio transport and is intended for Claude Desktop, Cursor, Windsurf, or any MCP client.

## Install

```bash
pnpm add @banka/mcp @banka/sdk
```

## Run

```bash
banka-mcp --rpc-url https://api.mainnet-beta.solana.com
```

Optional flags:
- `--keypair /path/to/id.json`
- `--rpc-url https://...`

## MCP Config

```json
{
  "mcpServers": {
    "banka": {
      "command": "banka-mcp",
      "args": ["--rpc-url", "https://api.mainnet-beta.solana.com"]
    }
  }
}
```

## Programmatic Usage

```ts
import { startMcpServer } from '@banka/mcp';

await startMcpServer({
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  keypairPath: '/path/to/id.json',
});
```

## Notes

- The server resolves its agent through `@banka/sdk`.
- If you already have an initialized agent object, pass it directly to `createMcpServer({ agent })`.
- Tool responses are returned as compact JSON text blocks for MCP clients.
