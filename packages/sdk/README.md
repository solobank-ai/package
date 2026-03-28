# @banka/sdk

SDK for the `banka` stack on Solana. It focuses on the practical core:
- local wallet bootstrap
- SOL and USDC balances
- native transfers
- Jupiter swaps
- lending APY discovery across Kamino and marginfi
- auto-routing deposits to the best supply APY
- lifecycle actions for lending positions: borrow, repay, withdraw, rebalance
- MPP payments through the `banka` package

## Install

```bash
pnpm add @banka/sdk banka
```

## Quick Start

```ts
import { Banka } from '@banka/sdk';

await Banka.init();

const agent = await Banka.create();
const balance = await agent.getBalance();

console.log(balance.address, balance.sol, balance.usdc);
```

## Send Funds

```ts
await agent.send({
  asset: 'USDC',
  amount: 2.5,
  to: 'RECIPIENT_PUBLIC_KEY',
});
```

## Pay MPP-Protected APIs

```ts
const result = await agent.pay({
  url: 'https://api.example.com/protected',
  maxPrice: 0.05,
});
```

## Quote And Execute Swaps

```ts
const quote = await agent.getSwapQuote({
  amount: 25,
  fromAsset: 'USDC',
  toAsset: 'SOL',
});

const result = await agent.swap({
  amount: 25,
  fromAsset: 'USDC',
  toAsset: 'SOL',
  slippageBps: 50,
});
```

## Discover Best Lending APY

```ts
const rates = await agent.getLendingRates({
  asset: 'USDC',
  protocol: 'auto',
});

const best = rates[0];
```

## Lend Into The Best Opportunity

```ts
const result = await agent.lend({
  asset: 'USDC',
  amount: 100,
  protocol: 'auto',
});
```

`protocol: 'auto'` currently compares `marginfi` and `Kamino` supply APY for the requested asset.

## Lending Lifecycle

```ts
await agent.borrow({
  asset: 'USDC',
  amount: 25,
  protocol: 'marginfi',
});

await agent.repay({
  asset: 'USDC',
  amount: 5,
  protocol: 'marginfi',
});

await agent.withdraw({
  asset: 'USDC',
  amount: 20,
  protocol: 'marginfi',
});

await agent.rebalance({
  asset: 'USDC',
  amount: 50,
  protocol: 'marginfi',
  targetProtocol: 'auto',
  minApyDelta: 0.005,
});
```

If you need a precise target, you can also pass `marketAddress`, `bankAddress`, or `reserveAddress`.

## Environment

```bash
export BANKA_RPC_URL=https://api.mainnet-beta.solana.com
export BANKA_JUP_BASE_URL=https://lite-api.jup.ag
```

If you use Jupiter Pro, also set:

```bash
export BANKA_JUP_API_KEY=...
```

## Exports

```ts
import {
  Banka,
  SUPPORTED_ASSETS,
  formatUsd,
  truncateAddress,
  walletExists,
} from '@banka/sdk';
```
