import { describe, it, expect, beforeEach } from 'vitest';
import { VaultClient, hashReasoning } from './client.js';

describe('VaultClient', () => {
  let vault: VaultClient;

  beforeEach(async () => {
    vault = new VaultClient({ rpcUrl: 'https://api.devnet.solana.com' });
    await vault.initialize('TestOwner111111111111111111111111', {
      maxPerTx: 50,
      dailyLimit: 200,
    });
  });

  it('initializes with correct state', async () => {
    const state = await vault.getState();
    expect(state).not.toBeNull();
    expect(state!.balance).toBe(0n);
    expect(state!.isLocked).toBe(false);
  });

  it('deposits and tracks balance', async () => {
    const { balance } = await vault.deposit(100);
    expect(balance).toBe(100);

    const state = await vault.getState();
    expect(state!.balance).toBe(100_000_000n);
  });

  it('records AI decision', async () => {
    await vault.deposit(100);

    const { decisionId, reasoningHash } = await vault.aiDecide({
      decisionType: 'lend',
      asset: 'USDC',
      amount: 50,
      reasoning: 'Kamino has higher APY',
    });

    expect(decisionId).toBe('decision_1');
    expect(reasoningHash).toHaveLength(64); // hex SHA-256

    const decisions = await vault.getDecisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].decisionType).toBe('lend');
    expect(decisions[0].status).toBe('pending');
  });

  it('executes pending decision', async () => {
    await vault.deposit(100);
    await vault.aiDecide({
      decisionType: 'lend',
      asset: 'USDC',
      amount: 50,
      reasoning: 'test',
    });

    const { executed } = await vault.executeDecision('decision_1');
    expect(executed).toBe(true);

    const state = await vault.getState();
    expect(state!.balance).toBe(50_000_000n); // 100 - 50

    const decisions = await vault.getDecisions();
    expect(decisions[0].status).toBe('executed');
  });

  it('rejects decision exceeding per-tx limit', async () => {
    await vault.deposit(100);

    await expect(
      vault.aiDecide({ decisionType: 'lend', asset: 'USDC', amount: 60, reasoning: 'test' }),
    ).rejects.toThrow('per-tx limit');
  });

  it('rejects decision when vault is locked', async () => {
    await vault.deposit(100);
    await vault.lock();

    await expect(
      vault.aiDecide({ decisionType: 'lend', asset: 'USDC', amount: 10, reasoning: 'test' }),
    ).rejects.toThrow('locked');
  });

  it('withdraws funds', async () => {
    await vault.deposit(100);
    const { balance } = await vault.withdraw(30);
    expect(balance).toBe(70);
  });

  it('rejects withdraw exceeding balance', async () => {
    await vault.deposit(10);
    await expect(vault.withdraw(20)).rejects.toThrow('Insufficient');
  });

  it('lock and unlock works', async () => {
    await vault.lock();
    const locked = await vault.getState();
    expect(locked!.isLocked).toBe(true);

    await vault.unlock();
    const unlocked = await vault.getState();
    expect(unlocked!.isLocked).toBe(false);
  });
});

describe('hashReasoning', () => {
  it('produces 32-byte hash', () => {
    const hash = hashReasoning('Kamino has higher APY');
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  it('same input = same hash', () => {
    const a = hashReasoning('test');
    const b = hashReasoning('test');
    expect(Buffer.from(a).toString('hex')).toBe(Buffer.from(b).toString('hex'));
  });

  it('different input = different hash', () => {
    const a = hashReasoning('lend to kamino');
    const b = hashReasoning('swap to USDC');
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });
});
