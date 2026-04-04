import { Method, Receipt } from 'mppx';
import { createSolanaRpc, address, signature as toSignature } from '@solana/kit';
import { solanaCharge } from './method.js';
import {
  SOLANA_USDC_MINT,
  USDC_DECIMALS,
  parseAmountToRaw,
  sumReceivedTokenAmount,
  type TokenBalance,
} from './utils.js';

export { solanaCharge } from './method.js';
export { SOLANA_USDC_MINT, USDC_DECIMALS } from './utils.js';

export type SolanaNetwork = 'mainnet-beta' | 'devnet' | 'testnet';
export type SolanaCommitment = 'confirmed' | 'finalized';

export interface SolanaServerOptions {
  currency?: string;
  recipient: string;
  rpcUrl?: string;
  network?: SolanaNetwork;
  commitment?: SolanaCommitment;
  /** Atomic check-and-mark: return true if reference is NEW (first use). Must be atomic (e.g. Redis SETNX). */
  tryConsumeReference?: (reference: string) => Promise<boolean>;
}

function clusterRpcUrl(network: SolanaNetwork): string {
  switch (network) {
    case 'mainnet-beta': return 'https://api.mainnet-beta.solana.com';
    case 'devnet': return 'https://api.devnet.solana.com';
    case 'testnet': return 'https://api.testnet.solana.com';
  }
}

export function solana(options: SolanaServerOptions) {
  const network = options.network ?? 'mainnet-beta';
  const commitment = options.commitment ?? 'finalized';
  const rpc = createSolanaRpc(options.rpcUrl ?? clusterRpcUrl(network));
  const recipient = address(options.recipient);
  const currency = options.currency ?? SOLANA_USDC_MINT;

  if (!options.tryConsumeReference) {
    console.warn('[mpp-solana] WARNING: No replay protection configured. Signatures can be reused!');
  }

  return Method.toServer(solanaCharge, {
    defaults: {
      currency,
      recipient,
    },

    async verify({ credential }) {
      const sig = credential.payload.signature;

      // Validate signature format
      if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(sig)) {
        throw new Error('Invalid signature format');
      }

      // 1. Verify on-chain FIRST (before consuming reference)
      let tx: any = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          tx = await rpc
            .getTransaction(toSignature(sig), {
              commitment,
              encoding: 'jsonParsed',
              maxSupportedTransactionVersion: 0,
            })
            .send();
        } catch {
          // RPC error, retry
        }

        if (tx) break;

        if (attempt === 4) {
          throw new Error('Transaction not found');
        }

        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }

      if (!tx?.meta) {
        throw new Error('Transaction not found');
      }

      if (tx.meta.err) {
        throw new Error('Transaction failed on-chain');
      }

      const transferredRaw = sumReceivedTokenAmount(
        tx.meta.preTokenBalances as TokenBalance[],
        tx.meta.postTokenBalances as TokenBalance[],
        currency,
        recipient,
      );

      if (transferredRaw <= 0n) {
        throw new Error('Payment not found in transaction token balances');
      }

      const requestedRaw = parseAmountToRaw(credential.challenge.request.amount, USDC_DECIMALS);
      if (requestedRaw <= 0n) {
        throw new Error('Invalid requested amount');
      }
      if (transferredRaw < requestedRaw) {
        throw new Error(
          `Transferred ${transferredRaw} < requested ${requestedRaw} (raw units)`,
        );
      }

      // 2. Replay protection AFTER successful verification
      if (options.tryConsumeReference) {
        const isNew = await options.tryConsumeReference(sig);
        if (!isNew) {
          throw new Error('Payment reference already used');
        }
      }

      return Receipt.from({
        method: 'solana',
        reference: sig,
        status: 'success',
        timestamp: new Date().toISOString(),
      });
    },
  });
}
