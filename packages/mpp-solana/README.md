# @solobank/mpp-solana

Solana USDC payment method for the [Machine Payments Protocol (MPP)](https://mpp.dev), built around Solana RPC plus SPL Token transfers.

## Installation

```bash
pnpm add @solobank/mpp-solana mppx @solana/web3.js
```

## Accept Payments

```ts
import { Mppx } from 'mppx';
import { solanaServer, SOLANA_USDC_MINT } from '@solobank/mpp-solana';

const mppx = Mppx.create({
  methods: [
    solanaServer({
      currency: SOLANA_USDC_MINT,
      recipient: 'YOUR_SOLANA_WALLET',
    }),
  ],
});
```

The server verifies the submitted Solana signature directly against RPC token balance deltas.

## Make Payments

```ts
import { Connection, Keypair } from '@solana/web3.js';
import { Mppx } from 'mppx/client';
import { solanaClient } from '@solobank/mpp-solana';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const signer = Keypair.generate();

const mppx = Mppx.create({
  methods: [
    solanaClient({
      connection,
      signer: {
        publicKey: signer.publicKey,
        signTransaction: async (tx) => {
          tx.sign(signer);
          return tx;
        },
      },
    }),
  ],
});
```

The client:
- loads all SPL token accounts for the requested mint
- builds one or more `transferChecked` instructions
- creates the recipient ATA if needed
- signs and broadcasts the transaction
- returns the Solana signature as the MPP credential

## Exports

```ts
import {
  solanaClient,
  solanaServer,
  SOLANA_USDC_MINT,
  USDC_DECIMALS,
  parseAmountToRaw,
} from '@solobank/mpp-solana';
```

## Testing

```bash
pnpm --filter @solobank/mpp-solana test
pnpm --filter @solobank/mpp-solana typecheck
```
