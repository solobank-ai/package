import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** A single persisted contact entry. */
export interface Contact {
  name: string;
  address: string;
}

/** The shape of the JSON file written to disk. */
interface ContactsFile {
  contacts: Record<string, string>;
}

/**
 * Solana base58 public keys are 32 bytes encoded in base58, which produces
 * strings between 32 and 44 characters consisting of base58 alphabet chars.
 * We use this as the canonical "looks like a raw address" heuristic in resolve().
 */
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Valid contact names: alphanumeric plus underscores, 1–32 characters,
 * must not start with "0x" (which would suggest a hex address, not a name).
 */
const NAME_RE = /^[a-zA-Z0-9_]{1,32}$/;

/** Names that are semantically reserved and must not be used as contacts. */
const RESERVED_NAMES = new Set<string>(['self', 'me', 'all']);

/**
 * Validates a proposed contact name and throws a descriptive error if it is
 * invalid. Called on both add() and remove() so the contract is consistent.
 */
function assertValidName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `Invalid contact name "${name}". Names must be 1–32 characters and contain ` +
        'only letters, digits, or underscores.',
    );
  }

  if (name.startsWith('0x')) {
    throw new Error(
      `Invalid contact name "${name}". Names must not start with "0x".`,
    );
  }

  if (RESERVED_NAMES.has(name.toLowerCase())) {
    throw new Error(
      `"${name}" is a reserved name and cannot be used as a contact.`,
    );
  }
}

/**
 * Returns true when the string looks like a raw Solana public key (base58,
 * 32–44 characters). Used by resolve() to detect pass-through addresses.
 */
function looksLikeSolanaAddress(value: string): boolean {
  return SOLANA_ADDRESS_RE.test(value);
}

/**
 * File-backed address book for Solobank.
 *
 * Contacts are stored at `<configDir>/contacts.json` with 0o600 permissions.
 * All disk I/O is synchronous, matching the SafeguardEnforcer pattern used
 * elsewhere in the SDK.
 *
 * @example
 * ```typescript
 * const contacts = new ContactManager('/home/user/.config/solobank');
 * contacts.load();
 * contacts.add('alice', '7WxWA6rAtftYBiXhYzLChsvSjBREYEsjvthUJCZxj1iM');
 * const addr = contacts.resolve('alice');
 * // => '7WxWA6rAtftYBiXhYzLChsvSjBREYEsjvthUJCZxj1iM'
 * const addr2 = contacts.resolve('7WxWA6rAtftYBiXhYzLChsvSjBREYEsjvthUJCZxj1iM');
 * // => '7WxWA6rAtftYBiXhYzLChsvSjBREYEsjvthUJCZxj1iM'
 * ```
 */
export class ContactManager {
  /** In-memory map of name -> address, kept in sync with disk. */
  private entries: Map<string, string> = new Map();
  private readonly filePath: string;

  constructor(configDir: string) {
    this.filePath = join(configDir, 'contacts.json');
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Loads contacts from disk into memory. Safe to call multiple times;
   * subsequent calls re-read the file and replace the in-memory state.
   * If the file does not exist the manager starts with an empty contact list.
   */
  load(): void {
    if (!existsSync(this.filePath)) {
      this.entries = new Map();
      return;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as ContactsFile;
      const contacts = parsed?.contacts ?? {};

      this.entries = new Map(
        Object.entries(contacts).filter(
          ([k, v]) => typeof k === 'string' && typeof v === 'string',
        ),
      );
    } catch {
      // Corrupted or unreadable file — start clean rather than crash.
      this.entries = new Map();
    }
  }

  /** Persists the current in-memory state to disk with 0o600 permissions. */
  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    const payload: ContactsFile = {
      contacts: Object.fromEntries(this.entries),
    };

    writeFileSync(
      this.filePath,
      JSON.stringify(payload, null, 2) + '\n',
      { mode: 0o600, encoding: 'utf-8' },
    );
  }

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  /**
   * Adds or overwrites a contact. Throws if the name is invalid or the address
   * is not a plausible Solana public key.
   */
  add(name: string, address: string): void {
    assertValidName(name);

    if (!looksLikeSolanaAddress(address)) {
      throw new Error(
        `"${address}" does not look like a valid Solana address ` +
          '(expected base58, 32–44 characters).',
      );
    }

    this.entries.set(name, address);
    this.save();
  }

  /**
   * Removes a contact by name. Throws if the name is invalid.
   * Returns true when the contact existed and was removed, false when it was
   * not found (idempotent — callers can ignore the return value if preferred).
   */
  remove(name: string): boolean {
    assertValidName(name);

    const existed = this.entries.has(name);
    if (existed) {
      this.entries.delete(name);
      this.save();
    }
    return existed;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Returns the address for an exact contact name, or undefined if not found.
   */
  get(name: string): string | undefined {
    return this.entries.get(name);
  }

  /**
   * Returns all contacts as an array of `{ name, address }` objects, sorted
   * alphabetically by name for stable, predictable output.
   */
  list(): Contact[] {
    return Array.from(this.entries.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, address]) => ({ name, address }));
  }

  /**
   * Resolves a contact name or a raw Solana public key to an address string.
   *
   * Resolution order:
   * 1. If `nameOrAddress` matches a stored contact name, returns that address.
   * 2. If `nameOrAddress` looks like a raw Solana base58 public key (32–44
   *    chars), returns it as-is — useful when callers don't know in advance
   *    whether they have a name or a literal address.
   * 3. Otherwise throws, because neither interpretation could be satisfied.
   *
   * @throws {Error} When the value is neither a known contact name nor a
   *   plausible Solana address.
   */
  resolve(nameOrAddress: string): string {
    // Prefer an exact name match first so that contacts whose name happens to
    // look like a valid address (unlikely but possible) are still looked up.
    const byName = this.entries.get(nameOrAddress);
    if (byName !== undefined) {
      return byName;
    }

    if (looksLikeSolanaAddress(nameOrAddress)) {
      return nameOrAddress;
    }

    throw new Error(
      `"${nameOrAddress}" is neither a known contact name nor a valid Solana address.`,
    );
  }
}
