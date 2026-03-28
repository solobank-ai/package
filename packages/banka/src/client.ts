import { Credential, Method } from 'mppx';
import {
  Connection,
  PublicKey,
  Transaction,
  type Commitment,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { solanaCharge } from './method.js';
import {
  USDC_DECIMALS,
  SOLANA_USDC_MINT,
  buildTransferPlan,
  fetchTokenAccounts,
  parseAmountToRaw,
} from './utils.js';

export { solanaCharge } from './method.js';
export { SOLANA_USDC_MINT, USDC_DECIMALS } from './utils.js';

export interface SolanaTransactionSigner {
  publicKey: PublicKey;
  signTransaction(transaction: Transaction): Promise<Transaction>;
}

export interface SolanaChargeOptions {
  connection: Connection;
  signer: SolanaTransactionSigner;
  commitment?: Commitment;
  /** Override transaction execution (for sponsored flows or custom relays). */
  execute?: (transaction: Transaction) => Promise<{ signature: string }>;
}

export function solana(options: SolanaChargeOptions) {
  return Method.toClient(solanaCharge, {
    async createCredential({ challenge }) {
      const { amount, currency, recipient } = challenge.request;
      const mint = new PublicKey(currency || SOLANA_USDC_MINT);
      const recipientOwner = new PublicKey(recipient);
      const amountRaw = parseAmountToRaw(amount, USDC_DECIMALS);
      const commitment = options.commitment ?? 'confirmed';

      const tokenAccounts = await fetchTokenAccounts(
        options.connection,
        options.signer.publicKey,
        mint,
      );

      if (tokenAccounts.length === 0) {
        throw new Error('No USDC balance to pay with');
      }

      const totalBalance = tokenAccounts.reduce((sum, account) => sum + account.amount, 0n);
      if (totalBalance < amountRaw) {
        const available = Number(totalBalance) / 10 ** USDC_DECIMALS;
        const requested = Number(amountRaw) / 10 ** USDC_DECIMALS;
        throw new Error(
          `Not enough USDC to pay $${requested.toFixed(2)} (available: $${available.toFixed(2)})`,
        );
      }

      const transferPlan = buildTransferPlan(tokenAccounts, amountRaw);
      const recipientAta = getAssociatedTokenAddressSync(
        mint,
        recipientOwner,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const tx = new Transaction();
      tx.feePayer = options.signer.publicKey;

      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          options.signer.publicKey,
          recipientAta,
          recipientOwner,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );

      for (const step of transferPlan) {
        tx.add(
          createTransferCheckedInstruction(
            step.address,
            mint,
            recipientAta,
            options.signer.publicKey,
            step.amount,
            USDC_DECIMALS,
            [],
            TOKEN_PROGRAM_ID,
          ),
        );
      }

      const latest = await options.connection.getLatestBlockhash(commitment);
      tx.recentBlockhash = latest.blockhash;

      try {
        if (options.execute) {
          const result = await options.execute(tx);
          return Credential.serialize({
            challenge,
            payload: { signature: result.signature },
          });
        }

        const signed = await options.signer.signTransaction(tx);
        const signature = await options.connection.sendRawTransaction(signed.serialize());
        const confirmation = await options.connection.confirmTransaction(
          {
            signature,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
          },
          commitment,
        );

        if (confirmation.value.err) {
          throw new Error(JSON.stringify(confirmation.value.err));
        }

        return Credential.serialize({
          challenge,
          payload: { signature },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Payment transaction failed: ${msg}`);
      }
    },
  });
}
