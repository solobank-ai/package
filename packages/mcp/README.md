# @solobank/mcp

Minimal MCP server for a `@solobank/sdk` agent on Solana.

The package keeps the scope deliberately small:
- `solobank_address`
- `solobank_balance`
- `solobank_send`
- `solobank_pay`

The package uses stdio transport and is intended for Claude Desktop, Cursor, Windsurf, or any MCP client.

## Install

```bash
pnpm add @solobank/mcp @solobank/sdk
```

## Run

```bash
solobank-mcp --rpc-url https://api.devnet.solana.com
```

Optional flags:
- `--keypair /path/to/id.json`
- `--rpc-url https://...`

## MCP Config

```json
{
  "mcpServers": {
    "solobank": {
      "command": "solobank-mcp",
      "args": ["--rpc-url", "https://api.devnet.solana.com"]
    }
  }
}
```

## Programmatic Usage

```ts
import { startMcpServer } from '@solobank/mcp';

await startMcpServer({
  rpcUrl: 'https://api.devnet.solana.com',
  keypairPath: '/path/to/id.json',
});
```

## Notes

- The server resolves its agent through `@solobank/sdk`.
- If you already have an initialized agent object, pass it directly to `createMcpServer({ agent })`.
- Tool responses are returned as compact JSON text blocks for MCP clients.
