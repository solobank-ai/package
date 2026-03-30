# @solobank/cli

Compact Solana CLI for the `solobank` stack.

## Install

```bash
pnpm add -g @solobank/cli
```

## Commands

```bash
solobank init
solobank address
solobank balance
solobank send 0.1 RECIPIENT --asset SOL
solobank send 2.5 RECIPIENT --asset USDC
solobank swap-quote 25 USDC SOL
solobank swap 25 USDC SOL --slippage-bps 50
solobank lend-rates USDC
solobank lend 100 USDC --protocol auto
solobank borrow 10 USDC --protocol marginfi
solobank repay 5 USDC --protocol marginfi
solobank withdraw 20 USDC --protocol marginfi
solobank rebalance 50 USDC --protocol marginfi --target-protocol auto --min-apy-delta 0.005
solobank pay https://api.example.com/protected --max-price 0.05
solobank mcp
```

`solobank mcp` prints a ready-to-paste stdio config snippet for `@solobank/mcp`.

For position-specific actions you can also pin the exact target:

```bash
solobank borrow 10 USDC --protocol marginfi --bank <BANK_ADDRESS>
solobank withdraw 20 USDC --protocol kamino --market <MARKET_ADDRESS> --reserve <RESERVE_ADDRESS>
```

## Environment

```bash
export SOLOBANK_RPC_URL=https://api.devnet.solana.com
export SOLOBANK_JUP_BASE_URL=https://lite-api.jup.ag
```

Optional for Jupiter Pro:

```bash
export SOLOBANK_JUP_API_KEY=...
```
