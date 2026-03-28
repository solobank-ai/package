# @banka/cli

Compact Solana CLI for the `banka` stack.

## Install

```bash
pnpm add -g @banka/cli
```

## Commands

```bash
banka init
banka address
banka balance
banka send 0.1 RECIPIENT --asset SOL
banka send 2.5 RECIPIENT --asset USDC
banka swap-quote 25 USDC SOL
banka swap 25 USDC SOL --slippage-bps 50
banka lend-rates USDC
banka lend 100 USDC --protocol auto
banka borrow 10 USDC --protocol marginfi
banka repay 5 USDC --protocol marginfi
banka withdraw 20 USDC --protocol marginfi
banka rebalance 50 USDC --protocol marginfi --target-protocol auto --min-apy-delta 0.005
banka pay https://api.example.com/protected --max-price 0.05
banka mcp
```

`banka mcp` prints a ready-to-paste stdio config snippet for `@banka/mcp`.

For position-specific actions you can also pin the exact target:

```bash
banka borrow 10 USDC --protocol marginfi --bank <BANK_ADDRESS>
banka withdraw 20 USDC --protocol kamino --market <MARKET_ADDRESS> --reserve <RESERVE_ADDRESS>
```

## Environment

```bash
export BANKA_RPC_URL=https://api.mainnet-beta.solana.com
export BANKA_JUP_BASE_URL=https://lite-api.jup.ag
```

Optional for Jupiter Pro:

```bash
export BANKA_JUP_API_KEY=...
```
