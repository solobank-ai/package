# Integration Notes

`@solobank/sdk` is a Solana SDK. The current public surface is built around direct integrations instead of a generic adapter plugin API.

Today the supported protocol layer is:
- `Jupiter` for swaps
- `Kamino` for lending
- `marginfi` for lending

If you want to extend protocol coverage, follow these rules:

1. Add the integration inside `packages/sdk/src/`.
2. Keep the public API expressed in `Solobank` methods, not protocol-specific classes.
3. Resolve user-facing assets by symbol or mint.
4. Return normalized results with protocol, asset, amount, APY/APR, market metadata, and signature.
5. Keep signing and transaction submission inside the SDK only when the method is explicitly an execution method.
6. Add tests for routing and CLI exposure.

Typical extension points in the current SDK:
- swaps: `packages/sdk/src/swap.ts`
- lending discovery and execution: `packages/sdk/src/lending.ts`
- asset registry: `packages/sdk/src/assets.ts`

Before opening a PR or publishing a new package version, run:

```bash
pnpm --filter @solobank/sdk typecheck
pnpm --filter @solobank/sdk test
pnpm --filter @solobank/sdk build
```
