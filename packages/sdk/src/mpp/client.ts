import { Credential, Method } from 'mppx';
import {
  address,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  pipe,
  compileTransaction,
  signTransaction,
  getSignatureFromTransaction,
  getBase64EncodedWireTransaction,
  sendAndConfirmTransactionFactory,
  assertIsTransactionWithinSizeLimit,
  type KeyPairSigner,
} from '@solana/kit';
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from '@solana-program/token';
import { solanaCharge } from './method.js';
import {
  USDC_DECIMALS,
  SOLANA_USDC_MINT,
  buildTransferPlan,
  fetchTokenAccounts,
  parseAmountToRaw,
} from './utils.js';

export { solanaCharge } from './method.js';
export { SOLANA_USDC_MINT, getSolanaUsdcMint, USDC_DECIMALS } from './utils.js';

export interface SolanaChargeOptions {
  rpcUrl: string;
  signer: KeyPairSigner;
  commitment?: 'confirmed' | 'finalized';
  /** Override transaction execution (for sponsored flows or custom relays). */
  execute?: (transactionBytes: Uint8Array) => Promise<{ signature: string }>;
}

export function solana(options: SolanaChargeOptions) {
  return Method.toClient(solanaCharge, {
    async createCredential({ challenge }) {
      const { amount, currency, recipient } = challenge.request;
      const mint = address(currency || SOLANA_USDC_MINT);
      const recipientOwner = address(recipient);
      const amountRaw = parseAmountToRaw(amount, USDC_DECIMALS);
      const commitment = options.commitment ?? 'confirmed';

      const rpc = createSolanaRpc(options.rpcUrl);

      const tokenAccounts = await fetchTokenAccounts(rpc, options.signer.address, mint);

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
      const [recipientAta] = await findAssociatedTokenPda({
        owner: recipientOwner,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
        mint,
      });

      // Build instructions
      const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
        payer: options.signer,
        ata: recipientAta,
        owner: recipientOwner,
        mint,
      });

      const transferInstructions = transferPlan.map((step) =>
        getTransferCheckedInstruction({
          source: step.address,
          mint,
          destination: recipientAta,
          authority: options.signer.address,
          amount: step.amount,
          decimals: USDC_DECIMALS,
        }),
      );

      // Build transaction message
      const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment }).send();

      const txMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(options.signer.address, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
        (m) => appendTransactionMessageInstructions([createAtaIx, ...transferInstructions], m),
      );

      const compiled = compileTransaction(txMessage);
      const signed = await signTransaction([options.signer.keyPair], compiled);

      try {
        if (options.execute) {
          const wireBytes = getBase64EncodedWireTransaction(signed);
          const txBytes = Uint8Array.from(atob(wireBytes), (c) => c.charCodeAt(0));
          const result = await options.execute(txBytes);
          return Credential.serialize({
            challenge,
            payload: { signature: result.signature },
          });
        }

        // Derive WebSocket URL from HTTP URL
        const wsUrl = options.rpcUrl
          .replace('https://', 'wss://')
          .replace('http://', 'ws://');
        const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl);
        const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

        assertIsTransactionWithinSizeLimit(signed);
        await sendAndConfirm(signed, { commitment });
        const sig = getSignatureFromTransaction(signed);

        return Credential.serialize({
          challenge,
          payload: { signature: sig },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Payment transaction failed: ${msg}`);
      }
    },
  });
}
