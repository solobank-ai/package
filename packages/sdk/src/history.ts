import { Connection, PublicKey } from '@solana/web3.js';
import type { ParsedTransactionWithMeta, ConfirmedSignatureInfo } from '@solana/web3.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAMPORTS_PER_SOL = 1_000_000_000;
const EXPLORER_BASE_URL = 'https://solscan.io/tx/';

/**
 * Well-known program IDs used for transaction type classification.
 * Sources:
 *   - SPL Token: spl-token v3 (legacy) and Token-2022
 *   - Jupiter Aggregator v6: JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
 *   - Kamino Lending: KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD
 *   - MarginFi v2: MFv2hWf31Z9kbCa1snEPdcgp7nZFBuoEfcvLLyiKGpQ
 */
const PROGRAM_IDS = {
  SPL_TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  SPL_TOKEN_2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  KAMINO_LENDING: 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD',
  MARGINFI_V2: 'MFv2hWf31Z9kbCa1snEPdcgp7nZFBuoEfcvLLyiKGpQ',
} as const;

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type TransactionType = 'transfer' | 'swap' | 'lend' | 'unknown';

export interface TransactionRecord {
  signature: string;
  timestamp: number | null;
  slot: number;
  success: boolean;
  /** Transaction fee denominated in SOL. */
  fee: number;
  type: TransactionType;
  explorerUrl: string;
}

/**
 * Richer record returned by `getTransactionDetail`, which fetches the full
 * parsed transaction and can extract fee and type with higher confidence.
 */
export interface TransactionDetail extends TransactionRecord {
  /** Fee in lamports (raw). Provided for callers that need full precision. */
  feeLamports: number;
  /** Program IDs invoked by the transaction's top-level instructions. */
  programIds: string[];
  /** Number of instructions in the transaction. */
  instructionCount: number;
}

export interface GetHistoryOptions {
  /** Maximum number of transactions to return (default: 20, max: 1000). */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildExplorerUrl(signature: string): string {
  return `${EXPLORER_BASE_URL}${signature}`;
}

function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Classifies a transaction type by inspecting the set of program IDs invoked.
 * Precedence: lend > swap > transfer > unknown.
 * Lending protocols take priority because they often also invoke SPL Token.
 */
function classifyByProgramIds(programIds: ReadonlyArray<string>): TransactionType {
  const ids = new Set(programIds);

  if (ids.has(PROGRAM_IDS.KAMINO_LENDING) || ids.has(PROGRAM_IDS.MARGINFI_V2)) {
    return 'lend';
  }

  if (ids.has(PROGRAM_IDS.JUPITER_V6)) {
    return 'swap';
  }

  if (ids.has(PROGRAM_IDS.SPL_TOKEN) || ids.has(PROGRAM_IDS.SPL_TOKEN_2022)) {
    return 'transfer';
  }

  return 'unknown';
}

/**
 * Extracts the top-level program IDs from a parsed transaction.
 * Only outer instructions are considered; inner instructions (CPI) are
 * intentionally excluded to keep classification representative of the
 * user-facing intent rather than internal protocol mechanics.
 */
function extractProgramIds(tx: ParsedTransactionWithMeta): string[] {
  const instructions = tx.transaction.message.instructions;
  return instructions
    .map((ix) => {
      // ParsedInstruction exposes `program`, PartiallyDecodedInstruction exposes `programId`.
      if ('programId' in ix) {
        return (ix.programId as PublicKey).toBase58();
      }
      return null;
    })
    .filter((id): id is string => id !== null);
}

/**
 * Maps a raw `ConfirmedSignatureInfo` entry — which contains only the data
 * returned by `getSignaturesForAddress` — to a `TransactionRecord`.
 *
 * Because the signature list response does not include account keys or
 * instruction data, type classification is not possible at this stage and
 * always resolves to `'unknown'`. Use `getTransactionDetail` for typed records.
 *
 * Fee is reported as 0 for the same reason: fee data is only available in the
 * full transaction response.
 */
function signatureInfoToRecord(info: ConfirmedSignatureInfo): TransactionRecord {
  return {
    signature: info.signature,
    timestamp: info.blockTime ?? null,
    slot: info.slot,
    success: info.err === null,
    fee: 0,
    type: 'unknown',
    explorerUrl: buildExplorerUrl(info.signature),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches recent confirmed transaction signatures for a wallet address and
 * maps each to a `TransactionRecord`.
 *
 * Because only the signature list is fetched (no full transaction data),
 * `fee` is always `0` and `type` is always `'unknown'` in the returned
 * records. For richer data on specific transactions, call
 * `getTransactionDetail`.
 *
 * @param connection - A `@solana/web3.js` `Connection` instance.
 * @param address    - Base58-encoded wallet public key.
 * @param options    - Optional fetch parameters (e.g. `limit`).
 * @returns          - Array of `TransactionRecord`, most recent first.
 */
export async function getHistory(
  connection: Connection,
  address: string,
  options: GetHistoryOptions = {},
): Promise<TransactionRecord[]> {
  const limit = options.limit ?? 20;

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit must be a positive integer. Received ${limit}`);
  }

  const publicKey = new PublicKey(address);
  const signatures = await connection.getSignaturesForAddress(publicKey, { limit });

  return signatures.map(signatureInfoToRecord);
}

/**
 * Fetches and parses the full detail for a single confirmed transaction.
 *
 * Unlike the lightweight records returned by `getHistory`, this call fetches
 * the complete parsed transaction, enabling accurate fee reporting and
 * type classification via program ID inspection.
 *
 * @param connection - A `@solana/web3.js` `Connection` instance.
 * @param signature  - Base58-encoded transaction signature.
 * @returns          - `TransactionDetail`, or `null` if the transaction is
 *                     not found (e.g. dropped, not yet confirmed, or pruned
 *                     from the node's history).
 */
export async function getTransactionDetail(
  connection: Connection,
  signature: string,
): Promise<TransactionDetail | null> {
  const tx = await connection.getParsedTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (tx === null) {
    return null;
  }

  const feeLamports = tx.meta?.fee ?? 0;
  const programIds = extractProgramIds(tx);

  return {
    signature,
    timestamp: tx.blockTime ?? null,
    slot: tx.slot,
    success: tx.meta?.err === null || tx.meta?.err === undefined,
    fee: lamportsToSol(feeLamports),
    feeLamports,
    type: classifyByProgramIds(programIds),
    explorerUrl: buildExplorerUrl(signature),
    programIds,
    instructionCount: tx.transaction.message.instructions.length,
  };
}
