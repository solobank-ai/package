/**
 * Structured error system for the Solobank SDK.
 *
 * All public SDK methods should throw `SolobankError` rather than raw `Error`
 * instances so callers can branch on `code` without string-matching messages.
 *
 * Retryable codes (transient infrastructure failures worth retrying):
 *   RPC_ERROR, TX_TIMEOUT, TX_SIMULATION_FAILED
 */

// ---------------------------------------------------------------------------
// Error code union
// ---------------------------------------------------------------------------

export type SolobankErrorCode =
  | 'INSUFFICIENT_BALANCE'
  | 'WALLET_LOCKED'
  | 'WALLET_NOT_FOUND'
  | 'WALLET_EXISTS'
  | 'SAFEGUARD_BLOCKED'
  | 'SWAP_NO_ROUTE'
  | 'SWAP_FAILED'
  | 'LENDING_NO_OPPORTUNITIES'
  | 'LENDING_FAILED'
  | 'CONTACT_NOT_FOUND'
  | 'CONTACT_EXISTS'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'INVALID_ASSET'
  | 'TX_FAILED'
  | 'TX_TIMEOUT'
  | 'TX_SIMULATION_FAILED'
  | 'RPC_ERROR'
  | 'MPP_PRICE_EXCEEDED'
  | 'MPP_PAYMENT_FAILED'
  | 'INTERNAL_URL_BLOCKED'
  | 'UNKNOWN';

// ---------------------------------------------------------------------------
// Retryability table
// ---------------------------------------------------------------------------

/**
 * The set of error codes that represent transient failures. Operations that
 * surface one of these codes MAY succeed if retried — the caller is responsible
 * for applying an appropriate back-off strategy.
 */
const RETRYABLE_CODES = new Set<SolobankErrorCode>([
  'RPC_ERROR',
  'TX_TIMEOUT',
  'TX_SIMULATION_FAILED',
]);

// ---------------------------------------------------------------------------
// SolobankError
// ---------------------------------------------------------------------------

/**
 * The canonical error type thrown by every public Solobank SDK method.
 *
 * @example
 * ```ts
 * try {
 *   await sdk.send({ to, amount, asset: 'USDC' });
 * } catch (err) {
 *   if (err instanceof SolobankError) {
 *     console.error(err.code, err.retryable, err.data);
 *   }
 * }
 * ```
 */
export class SolobankError extends Error {
  readonly name = 'SolobankError';

  /** Machine-readable classification of the failure. */
  readonly code: SolobankErrorCode;

  /**
   * Whether the operation that raised this error is safe to retry.
   * True only for transient infrastructure errors (RPC_ERROR, TX_TIMEOUT,
   * TX_SIMULATION_FAILED); false for all semantic / validation errors.
   */
  readonly retryable: boolean;

  /**
   * Optional structured payload providing additional context. Shape varies by
   * code and is intentionally open-ended so each call-site can attach whatever
   * diagnostic information is available without breaking the type signature.
   */
  readonly data: Record<string, unknown>;

  constructor(
    code: SolobankErrorCode,
    message: string,
    data: Record<string, unknown> = {},
  ) {
    super(message);
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
    this.data = data;

    // Restore the prototype chain when targeting ES5 downleveled output.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Returns a plain JSON-serialisable representation of this error, suitable
   * for logging, API responses, or IPC boundaries.
   */
  toJSON(): {
    name: string;
    code: SolobankErrorCode;
    message: string;
    retryable: boolean;
    data: Record<string, unknown>;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      data: this.data,
    };
  }
}

// ---------------------------------------------------------------------------
// mapWalletError
// ---------------------------------------------------------------------------

/**
 * Wraps an unknown thrown value into a `SolobankError`.
 *
 * Use this at the boundary of any operation that may throw raw errors from
 * third-party libraries or the runtime (e.g. RPC calls, transaction sends).
 * It inspects the raw error's message and, where possible, maps it to a
 * meaningful `SolobankErrorCode`; everything else becomes `UNKNOWN`.
 *
 * @param err - The raw value caught in a `catch` block.
 * @param fallbackCode - Override the default `UNKNOWN` code when the caller
 *   has enough context to narrow the error category even if message-matching
 *   fails (e.g. pass `'SWAP_FAILED'` inside the swap flow).
 *
 * @example
 * ```ts
 * try {
 *   await rpc.sendTransaction(tx);
 * } catch (err) {
 *   throw mapWalletError(err, 'TX_FAILED');
 * }
 * ```
 */
export function mapWalletError(
  err: unknown,
  fallbackCode: SolobankErrorCode = 'UNKNOWN',
): SolobankError {
  // Already a SolobankError — pass through unchanged.
  if (err instanceof SolobankError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const lowerMessage = message.toLowerCase();

  const code = detectCode(lowerMessage, fallbackCode);
  const data: Record<string, unknown> =
    err instanceof Error && err.stack ? { stack: err.stack } : {};

  return new SolobankError(code, message, data);
}

/**
 * Heuristically maps a lower-cased error message to a `SolobankErrorCode`.
 * Keeps the detection logic in one place so it can be extended without
 * touching call-sites.
 */
function detectCode(
  lowerMessage: string,
  fallback: SolobankErrorCode,
): SolobankErrorCode {
  // Wallet / keypair state
  if (lowerMessage.includes('wallet not found') || lowerMessage.includes('keypair not found')) {
    return 'WALLET_NOT_FOUND';
  }
  if (lowerMessage.includes('wallet already exists') || lowerMessage.includes('keypair already exists')) {
    return 'WALLET_EXISTS';
  }
  if (lowerMessage.includes('wallet is locked') || lowerMessage.includes('agent is locked')) {
    return 'WALLET_LOCKED';
  }

  // Balance / validation
  if (lowerMessage.includes('insufficient') && lowerMessage.includes('balance')) {
    return 'INSUFFICIENT_BALANCE';
  }
  if (lowerMessage.includes('invalid address') || lowerMessage.includes('not a valid base58')) {
    return 'INVALID_ADDRESS';
  }
  if (lowerMessage.includes('invalid amount') || lowerMessage.includes('amount must be')) {
    return 'INVALID_AMOUNT';
  }
  if (lowerMessage.includes('invalid asset') || lowerMessage.includes('unknown asset') || lowerMessage.includes('unsupported asset')) {
    return 'INVALID_ASSET';
  }

  // Swap
  if (lowerMessage.includes('no route') || lowerMessage.includes('route not found')) {
    return 'SWAP_NO_ROUTE';
  }
  if (lowerMessage.includes('swap') && (lowerMessage.includes('failed') || lowerMessage.includes('error'))) {
    return 'SWAP_FAILED';
  }

  // Lending
  if (lowerMessage.includes('no lending') || lowerMessage.includes('no opportunities')) {
    return 'LENDING_NO_OPPORTUNITIES';
  }
  if (lowerMessage.includes('lend') && (lowerMessage.includes('failed') || lowerMessage.includes('error'))) {
    return 'LENDING_FAILED';
  }

  // Transaction lifecycle
  if (lowerMessage.includes('simulation failed') || lowerMessage.includes('simulatetransaction')) {
    return 'TX_SIMULATION_FAILED';
  }
  if (lowerMessage.includes('timed out') || lowerMessage.includes('timeout') || lowerMessage.includes('block height exceeded')) {
    return 'TX_TIMEOUT';
  }
  if (lowerMessage.includes('transaction failed') || lowerMessage.includes('tx failed')) {
    return 'TX_FAILED';
  }

  // RPC / network
  if (
    lowerMessage.includes('fetch failed') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('network error') ||
    lowerMessage.includes('429') ||
    lowerMessage.includes('503') ||
    lowerMessage.includes('rpc')
  ) {
    return 'RPC_ERROR';
  }

  // MPP / payment
  if (lowerMessage.includes('mpp price') || lowerMessage.includes('maxprice')) {
    return 'MPP_PRICE_EXCEEDED';
  }
  if (lowerMessage.includes('mpp') && lowerMessage.includes('failed')) {
    return 'MPP_PAYMENT_FAILED';
  }

  // Safeguard
  if (lowerMessage.includes('safeguard') || lowerMessage.includes('locked') || lowerMessage.includes('limit')) {
    return 'SAFEGUARD_BLOCKED';
  }

  return fallback;
}

// ---------------------------------------------------------------------------
// isRetryable helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the given value is a `SolobankError` with `retryable: true`.
 *
 * Accepts `unknown` so it is safe to use directly in a `catch` block without
 * a preceding `instanceof` guard.
 *
 * @example
 * ```ts
 * for (let attempt = 0; attempt < 3; attempt++) {
 *   try {
 *     return await sdk.swap(options);
 *   } catch (err) {
 *     if (!isRetryable(err) || attempt === 2) throw err;
 *     await delay(500 * 2 ** attempt);
 *   }
 * }
 * ```
 */
export function isRetryable(err: unknown): err is SolobankError {
  return err instanceof SolobankError && err.retryable;
}
