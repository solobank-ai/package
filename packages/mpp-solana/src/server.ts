import { Method, Receipt } from 'mppx';
import { Connection, PublicKey, clusterApiUrl, type Cluster, type Finality } from '@solana/web3.js';
import { solanaCharge } from './method.js';
import {
  SOLANA_USDC_MINT,
  USDC_DECIMALS,
  parseAmountToRaw,
  sumReceivedTokenAmount,
} from './utils.js';

export { solanaCharge } from './method.js';
export { SOLANA_USDC_MINT, USDC_DECIMALS } from './utils.js';

export interface SolanaServerOptions {
  currency?: string;
  recipient: string;
  rpcUrl?: string;
  network?: Cluster;
  commitment?: Finality;
  isReferenceConsumed?: (reference: string) => Promise<boolean>;
  markReferenceConsumed?: (reference: string) => Promise<void>;
}

export function solana(options: SolanaServerOptions) {
  const network = options.network ?? 'mainnet-beta';
  const commitment = options.commitment ?? 'confirmed';
  const connection = new Connection(
    options.rpcUrl ?? clusterApiUrl(network),
    commitment,
  );
  const recipient = new PublicKey(options.recipient).toBase58();
  const currency = options.currency ?? SOLANA_USDC_MINT;

  return Method.toServer(solanaCharge, {
    defaults: {
      currency,
      recipient,
    },

    async verify({ credential }) {
      const signature = credential.payload.signature;

      if (await options.isReferenceConsumed?.(signature)) {
        throw new Error(`Payment reference already used [${signature}]`);
      }

      let tx: Awaited<ReturnType<typeof connection.getParsedTransaction>> | null = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        tx = await connection.getParsedTransaction(signature, {
          commitment,
          maxSupportedTransactionVersion: 0,
        });

        if (tx) {
          break;
        }

        if (attempt === 4) {
          throw new Error(`Could not find the referenced transaction [${signature}]`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }

      if (!tx?.meta) {
        throw new Error(`Could not find the referenced transaction [${signature}]`);
      }

      if (tx.meta.err) {
        throw new Error('Transaction failed on-chain');
      }

      const transferredRaw = sumReceivedTokenAmount(
        tx.meta.preTokenBalances,
        tx.meta.postTokenBalances,
        currency,
        recipient,
      );

      if (transferredRaw <= 0n) {
        throw new Error('Payment not found in transaction token balances');
      }

      const requestedRaw = parseAmountToRaw(credential.challenge.request.amount, USDC_DECIMALS);
      if (transferredRaw < requestedRaw) {
        throw new Error(
          `Transferred ${transferredRaw} < requested ${requestedRaw} (raw units)`,
        );
      }

      await options.markReferenceConsumed?.(signature);

      return Receipt.from({
        method: 'solana',
        reference: signature,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    },
  });
}
