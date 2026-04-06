import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Keypair } from '@solana/web3.js';
import { encryptKeypair, EncryptedKeypairFile } from './encryption.js';

/** Filename used to persist the session PIN on disk. */
const SESSION_FILE = '.session';

/** Filename used to store the encrypted keypair. */
const KEYPAIR_FILE = 'id.json';

/**
 * Resolves the active PIN using the following priority order:
 *  1. `SOLOBANK_PIN` environment variable
 *  2. Session file at `<configDir>/.session` (plaintext PIN)
 *
 * @returns The PIN string, or `null` if neither source is available.
 */
export function resolvePin(configDir: string): string | null {
  const envPin = process.env['SOLOBANK_PIN'];
  if (typeof envPin === 'string' && envPin.length > 0) {
    return envPin;
  }

  const sessionPath = join(configDir, SESSION_FILE);
  if (existsSync(sessionPath)) {
    const contents = readFileSync(sessionPath, 'utf8').trim();
    if (contents.length > 0) {
      return contents;
    }
  }

  return null;
}

/**
 * Persists the given PIN to `<configDir>/.session` with file mode 0o600
 * so that only the owning user can read or write it.
 *
 * @param configDir - Directory in which the session file will be written.
 * @param pin       - PIN string to persist.
 */
export function saveSession(configDir: string, pin: string): void {
  const sessionPath = join(configDir, SESSION_FILE);
  writeFileSync(sessionPath, pin, { encoding: 'utf8', mode: 0o600 });
}

/**
 * Removes the session file from `<configDir>/.session` if it exists.
 * Silently succeeds when the file is already absent.
 *
 * @param configDir - Directory from which the session file will be removed.
 */
export function clearSession(configDir: string): void {
  const sessionPath = join(configDir, SESSION_FILE);
  if (existsSync(sessionPath)) {
    unlinkSync(sessionPath);
  }
}

/**
 * Validates that a PIN meets the minimum security requirement of at least
 * four characters.
 *
 * @param pin - The PIN string to validate.
 * @returns `true` when the PIN is valid, `false` otherwise.
 */
export function validatePin(pin: string): boolean {
  return typeof pin === 'string' && pin.length >= 4;
}

/** Return value of {@link createPinEncryptedKeypair}. */
export interface CreateKeypairResult {
  /** Base-58 public key (wallet address) of the generated keypair. */
  address: string;
  /** Absolute path to the encrypted keypair file on disk. */
  keypairPath: string;
}

/**
 * Generates a new Solana Keypair, encrypts the secret key with the supplied
 * PIN as the password (via AES-256-GCM + scrypt key derivation), and writes
 * the resulting {@link EncryptedKeypairFile} as JSON to `<configDir>/id.json`
 * with file mode 0o600.
 *
 * @param configDir - Directory in which `id.json` will be written.
 * @param pin       - PIN used as the encryption password. Must satisfy
 *                    {@link validatePin} before calling this function.
 * @returns An object containing the wallet address and the absolute path to
 *          the saved keypair file.
 */
export function createPinEncryptedKeypair(
  configDir: string,
  pin: string,
): CreateKeypairResult {
  const keypair = Keypair.generate();

  const encrypted: EncryptedKeypairFile = encryptKeypair(
    keypair.secretKey,
    pin,
  );

  const keypairPath = join(configDir, KEYPAIR_FILE);
  writeFileSync(keypairPath, JSON.stringify(encrypted, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });

  return {
    address: keypair.publicKey.toBase58(),
    keypairPath,
  };
}
