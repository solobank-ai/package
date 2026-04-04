import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  loadSafeguardConfig,
  saveSafeguardConfig,
  checkTransaction,
  recordTransaction,
  lockWallet,
  unlockWallet,
  type SafeguardConfig,
} from './safeguards.js';

let tmpDir: string;
let configPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'solobank-test-'));
  configPath = join(tmpDir, 'config.json');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('loadSafeguardConfig', () => {
  it('returns defaults when file does not exist', async () => {
    const config = await loadSafeguardConfig(configPath);
    expect(config.maxAmountPerTx).toBe(1.0);
    expect(config.maxDailySend).toBeNull();
    expect(config.locked).toBe(false);
    expect(config.dailyLog).toEqual([]);
  });

  it('loads saved config', async () => {
    const custom: SafeguardConfig = {
      maxAmountPerTx: 5,
      maxDailySend: 100,
      locked: false,
      dailyLog: [],
    };
    await saveSafeguardConfig(custom, configPath);
    const loaded = await loadSafeguardConfig(configPath);
    expect(loaded.maxAmountPerTx).toBe(5);
    expect(loaded.maxDailySend).toBe(100);
  });
});

describe('checkTransaction', () => {
  it('allows transaction within limits', () => {
    const config: SafeguardConfig = {
      maxAmountPerTx: 10,
      maxDailySend: null,
      locked: false,
      dailyLog: [],
    };
    expect(() => checkTransaction(5, config)).not.toThrow();
  });

  it('rejects when wallet is locked', () => {
    const config: SafeguardConfig = {
      maxAmountPerTx: 10,
      maxDailySend: null,
      locked: true,
      dailyLog: [],
    };
    expect(() => checkTransaction(1, config)).toThrow('locked');
  });

  it('rejects when amount exceeds per-tx limit', () => {
    const config: SafeguardConfig = {
      maxAmountPerTx: 5,
      maxDailySend: null,
      locked: false,
      dailyLog: [],
    };
    expect(() => checkTransaction(10, config)).toThrow('per-transaction limit');
  });

  it('rejects when daily limit would be exceeded', () => {
    const config: SafeguardConfig = {
      maxAmountPerTx: 100,
      maxDailySend: 50,
      locked: false,
      dailyLog: [{ timestamp: Date.now() - 1000, amount: 45 }],
    };
    expect(() => checkTransaction(10, config)).toThrow('daily limit');
  });

  it('ignores stale daily log entries (older than 24h)', () => {
    const config: SafeguardConfig = {
      maxAmountPerTx: 100,
      maxDailySend: 50,
      locked: false,
      dailyLog: [{ timestamp: Date.now() - 25 * 60 * 60 * 1000, amount: 45 }],
    };
    expect(() => checkTransaction(10, config)).not.toThrow();
  });
});

describe('recordTransaction', () => {
  it('appends entry and prunes old ones', () => {
    const config: SafeguardConfig = {
      maxAmountPerTx: 100,
      maxDailySend: null,
      locked: false,
      dailyLog: [{ timestamp: Date.now() - 25 * 60 * 60 * 1000, amount: 5 }],
    };
    const updated = recordTransaction(10, config);
    expect(updated.dailyLog).toHaveLength(1); // old entry pruned, new one added
    expect(updated.dailyLog[0].amount).toBe(10);
  });
});

describe('lockWallet / unlockWallet', () => {
  it('toggles locked state', async () => {
    await lockWallet(configPath);
    let config = await loadSafeguardConfig(configPath);
    expect(config.locked).toBe(true);

    await unlockWallet(configPath);
    config = await loadSafeguardConfig(configPath);
    expect(config.locked).toBe(false);
  });
});
