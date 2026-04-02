import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import {
  Solobank,
  formatAssetAmount,
  formatUsd,
  loadSecretKey,
  resolveKeypairPath,
  saveSecretKey,
  truncateAddress,
  walletExists,
} from './index.js';
import { resolveAsset } from './assets.js';
import { pickBestLendingRate, pickRebalanceTarget } from './lending.js';

describe('@solobank/sdk', () => {
  it('initializes and reloads a wallet from disk', async () => {
    const configDir = await mkdtemp(path.join(os.tmpdir(), 'solobank-sdk-'));

    try {
      const init = await Solobank.init({ configDir });
      expect(init.address).toBeTruthy();
      expect(await walletExists(configDir)).toBe(true);

      const secretKey = await loadSecretKey(configDir);
      const loaded = await Solobank.fromSecretKey(secretKey, { configDir });

      expect(loaded.getAddress()).toBe(init.address);
      expect(resolveKeypairPath(configDir)).toContain('id.json');
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('saves secret keys as JSON arrays', async () => {
    const configDir = await mkdtemp(path.join(os.tmpdir(), 'solobank-sdk-save-'));

    try {
      const keypair = Keypair.generate();
      const savedPath = await saveSecretKey(keypair.secretKey, configDir);
      const raw = await readFile(savedPath, 'utf8');
      expect(raw.trim().startsWith('[')).toBe(true);
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('formats display helpers predictably', () => {
    expect(formatUsd(12.5)).toBe('$12.50');
    expect(formatAssetAmount(1.23456, 'SOL')).toBe('1.2346 SOL');
    expect(truncateAddress('ABCDEFGH12345678', 4, 4)).toBe('ABCD...5678');
  });

  it('resolves known assets and raw mints', () => {
    expect(resolveAsset('usdc').mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(resolveAsset('So11111111111111111111111111111111111111112').isKnown).toBe(false);
  });

  it('picks the best lending rate for auto routing', () => {
    const best = pickBestLendingRate([
      {
        protocol: 'marginfi',
        asset: 'USDC',
        mint: 'mint-1',
        apy: 0.03,
        marketAddress: 'market-1',
        decimals: 6,
      },
      {
        protocol: 'kamino',
        asset: 'USDC',
        mint: 'mint-1',
        apy: 0.06,
        marketAddress: 'market-2',
        reserveAddress: 'reserve-2',
        decimals: 6,
      },
    ]);

    expect(best.protocol).toBe('kamino');
    expect(best.apy).toBe(0.06);
  });

  it('picks a different lending venue for rebalance routing', () => {
    const rates = [
      {
        protocol: 'marginfi' as const,
        asset: 'USDC',
        mint: 'mint-1',
        apy: 0.03,
        marketAddress: 'market-1',
        bankAddress: 'bank-1',
        decimals: 6,
      },
      {
        protocol: 'kamino' as const,
        asset: 'USDC',
        mint: 'mint-1',
        apy: 0.06,
        marketAddress: 'market-2',
        reserveAddress: 'reserve-2',
        decimals: 6,
      },
    ];

    const target = pickRebalanceTarget(rates, rates[0]!);
    expect(target?.protocol).toBe('kamino');
    expect(target?.apy).toBe(0.06);
  });
});
