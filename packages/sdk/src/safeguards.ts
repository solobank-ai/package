import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SafeguardConfig {
  maxAmountPerTx: number;
  maxDailySend: number | null;
  locked: boolean;
  dailyLog: Array<{ timestamp: number; amount: number }>;
}

const DEFAULTS: SafeguardConfig = {
  maxAmountPerTx: 1.0,
  maxDailySend: null,
  locked: false,
  dailyLog: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultConfigPath(): string {
  return join(homedir(), '.solobank', 'config.json');
}

export async function loadSafeguardConfig(
  configPath?: string,
): Promise<SafeguardConfig> {
  const path = configPath ?? defaultConfigPath();
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSafeguardConfig(
  config: SafeguardConfig,
  configPath?: string,
): Promise<void> {
  const path = configPath ?? defaultConfigPath();
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

function pruneOldEntries(log: SafeguardConfig['dailyLog']): SafeguardConfig['dailyLog'] {
  const cutoff = Date.now() - DAY_MS;
  return log.filter((e) => e.timestamp > cutoff);
}

/**
 * Check whether a transaction of `amount` is allowed.
 * Throws descriptive error if blocked.
 */
export function checkTransaction(amount: number, config: SafeguardConfig): void {
  if (config.locked) {
    throw new Error(
      "Wallet is locked. Run 'solobank unlock' to re-enable transactions.",
    );
  }

  if (amount > config.maxAmountPerTx) {
    throw new Error(
      `Amount ${amount} exceeds per-transaction limit of ${config.maxAmountPerTx}. ` +
        `Run 'solobank config set maxAmountPerTx <value>' to adjust.`,
    );
  }

  if (config.maxDailySend !== null) {
    const recent = pruneOldEntries(config.dailyLog);
    const dailyTotal = recent.reduce((sum, e) => sum + e.amount, 0);
    if (dailyTotal + amount > config.maxDailySend) {
      throw new Error(
        `Amount ${amount} would exceed daily limit of ${config.maxDailySend} ` +
          `(already sent ${dailyTotal.toFixed(2)} today). ` +
          `Run 'solobank config set maxDailySend <value>' to adjust.`,
      );
    }
  }
}

/**
 * Record a completed transaction. Returns updated config (must be saved by caller).
 */
export function recordTransaction(
  amount: number,
  config: SafeguardConfig,
): SafeguardConfig {
  const log = pruneOldEntries(config.dailyLog);
  log.push({ timestamp: Date.now(), amount });
  return { ...config, dailyLog: log };
}

export async function lockWallet(configPath?: string): Promise<void> {
  const config = await loadSafeguardConfig(configPath);
  config.locked = true;
  await saveSafeguardConfig(config, configPath);
}

export async function unlockWallet(configPath?: string): Promise<void> {
  const config = await loadSafeguardConfig(configPath);
  config.locked = false;
  await saveSafeguardConfig(config, configPath);
}
