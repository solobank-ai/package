import { createHash } from 'node:crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

/**
 * Solobank Treasury program — collects fees on lend, borrow, and swap operations.
 * Fees are transferred in USDC to the treasury wallet in a separate transaction
 * after the main DeFi operation succeeds (best-effort).
 */

export const TREASURY_PROGRAM_ID = new PublicKey('9xpLht8FtpZgEGFpHpC6W3pupoHbfTsBMytj7CqxJ8us');
export const TREASURY_WALLET = new PublicKey('Aa78cPEQLq6hCYcenoZ1XLkVMqEqRKZwsdaHuDdXSaNT');

// Devnet USDC mint (switched via env for mainnet)
export const TREASURY_FEE_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
export const TREASURY_FEE_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export type FeeOperation = 'save' | 'borrow' | 'swap';

const INSTRUCTION_NAMES: Record<FeeOperation, string> = {
  save: 'collect_save_fee',
  borrow: 'collect_borrow_fee',
  swap: 'collect_swap_fee',
};

function getFeeMint(rpcUrl: string): PublicKey {
  return rpcUrl.includes('devnet') ? TREASURY_FEE_MINT_DEVNET : TREASURY_FEE_MINT_MAINNET;
}

function getConfigPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury-config')],
    TREASURY_PROGRAM_ID,
  );
  return pda;
}

function buildCollectFeeIx(
  operation: FeeOperation,
  amountRaw: bigint,
  user: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  const configPda = getConfigPda();
  const userAta = getAssociatedTokenAddressSync(mint, user, true);
  const treasuryAta = getAssociatedTokenAddressSync(mint, TREASURY_WALLET, true);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amountRaw);
  const data = Buffer.concat([anchorDiscriminator(INSTRUCTION_NAMES[operation]), amountBuf]);

  return new TransactionInstruction({
    programId: TREASURY_PROGRAM_ID,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export interface CollectFeeParams {
  connection: Connection;
  keypair: Keypair;
  rpcUrl: string;
  operation: FeeOperation;
  /** Amount in smallest units (raw). Fee is calculated on-chain as amount * bps / 10_000. */
  amountRaw: bigint;
}

export interface CollectFeeResult {
  signature: string;
  operation: FeeOperation;
  amountRaw: string;
}

/**
 * Sends a fee-collection transaction to the Solobank treasury program.
 * Best-effort: callers should catch errors and continue on failure.
 */
export async function collectFee(params: CollectFeeParams): Promise<CollectFeeResult> {
  const mint = getFeeMint(params.rpcUrl);
  const ix = buildCollectFeeIx(
    params.operation,
    params.amountRaw,
    params.keypair.publicKey,
    mint,
  );

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(
    params.connection,
    tx,
    [params.keypair],
    { commitment: 'confirmed' },
  );

  return {
    signature,
    operation: params.operation,
    amountRaw: params.amountRaw.toString(),
  };
}
