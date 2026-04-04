import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockFetchTokenAccounts, mockBuildTransferPlan } = vi.hoisted(() => ({
  mockFetchTokenAccounts: vi.fn(),
  mockBuildTransferPlan: vi.fn(),
}));

vi.mock('@solana/kit', () => ({
  address: (a: string) => a,
  createSolanaRpc: () => ({
    getLatestBlockhash: () => ({
      send: vi.fn().mockResolvedValue({
        value: { blockhash: 'mock-blockhash', lastValidBlockHeight: 100n },
      }),
    }),
    getBalance: () => ({ send: vi.fn() }),
    getTokenAccountBalance: () => ({ send: vi.fn() }),
  }),
  createSolanaRpcSubscriptions: () => ({}),
  createKeyPairSignerFromBytes: vi.fn().mockResolvedValue({
    address: 'AgentAddr111111111111111111111111111111111',
    keyPair: { type: 'mock-keypair' },
  }),
  createTransactionMessage: vi.fn().mockReturnValue({}),
  setTransactionMessageFeePayer: vi.fn().mockReturnValue({}),
  setTransactionMessageLifetimeUsingBlockhash: vi.fn().mockReturnValue({}),
  appendTransactionMessageInstructions: vi.fn().mockReturnValue({}),
  pipe: (_initial: any, ...fns: Function[]) => fns.reduce((v, f) => f(v), _initial),
  compileTransaction: vi.fn().mockReturnValue({}),
  signTransaction: vi.fn().mockResolvedValue({ mock: 'signed' }),
  getSignatureFromTransaction: vi.fn().mockReturnValue('mock-signature-abc123'),
  sendAndConfirmTransactionFactory: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
  assertIsTransactionWithinSizeLimit: vi.fn(),
}));

vi.mock('@solana-program/token', () => ({
  TOKEN_PROGRAM_ADDRESS: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  findAssociatedTokenPda: vi.fn().mockResolvedValue(['mock-ata-address']),
  getCreateAssociatedTokenIdempotentInstruction: vi.fn().mockReturnValue({ type: 'create-ata' }),
  getTransferCheckedInstruction: vi.fn().mockReturnValue({ type: 'transfer' }),
}));

vi.mock('./mpp/index.js', () => ({
  SOLANA_USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDC_DECIMALS: 6,
  parseAmountToRaw: (_amount: string, _decimals: number) => 10_000_000n,
  fetchTokenAccounts: mockFetchTokenAccounts,
  buildTransferPlan: mockBuildTransferPlan,
  solanaClient: vi.fn(),
}));

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn().mockImplementation(() => ({})),
  Keypair: {
    generate: vi.fn().mockReturnValue({
      publicKey: { toBase58: () => 'AgentAddr111111111111111111111111111111111' },
      secretKey: new Uint8Array(64),
    }),
    fromSecretKey: vi.fn().mockReturnValue({
      publicKey: { toBase58: () => 'AgentAddr111111111111111111111111111111111' },
      secretKey: new Uint8Array(64),
    }),
  },
  VersionedTransaction: vi.fn(),
}));

vi.mock('mppx/client', () => ({
  Mppx: { create: vi.fn() },
}));

import { Solobank } from './index.js';

async function createTestSolobank() {
  return Solobank.fromSecretKey(new Uint8Array(64));
}

describe('Solobank.send()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends SOL with dry run', async () => {
    const sb = await createTestSolobank();
    const result = await sb.send({ to: 'RecipientAddr1111111111111111111111111111', amount: 0.5, asset: 'SOL', dryRun: true });
    expect(result.signature).toBe('dry-run');
    expect(result.asset).toBe('SOL');
    expect(result.amount).toBe(0.5);
  });

  it('sends SOL on-chain and returns signature', async () => {
    const sb = await createTestSolobank();
    const result = await sb.send({ to: 'RecipientAddr1111111111111111111111111111', amount: 1.0, asset: 'SOL' });
    expect(result.signature).toBe('mock-signature-abc123');
    expect(result.explorerUrl).toContain('mock-signature-abc123');
    expect(result.asset).toBe('SOL');
  });

  it('defaults to USDC when no asset specified', async () => {
    mockFetchTokenAccounts.mockResolvedValue([
      { address: 'ata-1', amount: 100_000_000n },
    ]);
    mockBuildTransferPlan.mockReturnValue([
      { address: 'ata-1', amount: 10_000_000n },
    ]);

    const sb = await createTestSolobank();
    const result = await sb.send({ to: 'RecipientAddr1111111111111111111111111111', amount: 10 });
    expect(result.asset).toBe('USDC');
    expect(result.signature).toBe('mock-signature-abc123');
  });

  it('sends USDC with dry run', async () => {
    mockFetchTokenAccounts.mockResolvedValue([
      { address: 'ata-1', amount: 100_000_000n },
    ]);

    const sb = await createTestSolobank();
    const result = await sb.send({ to: 'RecipientAddr1111111111111111111111111111', amount: 5, dryRun: true });
    expect(result.signature).toBe('dry-run');
    expect(result.asset).toBe('USDC');
  });

  it('throws when no USDC balance available', async () => {
    mockFetchTokenAccounts.mockResolvedValue([]);

    const sb = await createTestSolobank();
    await expect(sb.send({ to: 'RecipientAddr1111111111111111111111111111', amount: 10 }))
      .rejects.toThrow('No USDC balance available');
  });

  it('throws on insufficient USDC balance', async () => {
    mockFetchTokenAccounts.mockResolvedValue([
      { address: 'ata-1', amount: 1_000_000n },
    ]);

    const sb = await createTestSolobank();
    await expect(sb.send({ to: 'RecipientAddr1111111111111111111111111111', amount: 100 }))
      .rejects.toThrow('Insufficient USDC balance');
  });
});
