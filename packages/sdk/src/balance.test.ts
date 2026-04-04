import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetBalance, mockGetTokenAccountBalance } = vi.hoisted(() => ({
  mockGetBalance: vi.fn(),
  mockGetTokenAccountBalance: vi.fn(),
}));

vi.mock('@solana/kit', () => ({
  address: (a: string) => a,
  createSolanaRpc: () => ({
    getLatestBlockhash: () => ({
      send: vi.fn().mockResolvedValue({
        value: { blockhash: 'mock-blockhash', lastValidBlockHeight: 100n },
      }),
    }),
    getBalance: () => ({ send: mockGetBalance }),
    getTokenAccountBalance: () => ({ send: mockGetTokenAccountBalance }),
  }),
  createSolanaRpcSubscriptions: () => ({}),
  createKeyPairSignerFromBytes: vi.fn().mockResolvedValue({
    address: 'AgentAddr111111111111111111111111111111111',
    keyPair: { type: 'mock-keypair' },
  }),
  createTransactionMessage: vi.fn(),
  setTransactionMessageFeePayer: vi.fn(),
  setTransactionMessageLifetimeUsingBlockhash: vi.fn(),
  appendTransactionMessageInstructions: vi.fn(),
  pipe: vi.fn(),
  compileTransaction: vi.fn(),
  signTransaction: vi.fn(),
  getSignatureFromTransaction: vi.fn(),
  sendAndConfirmTransactionFactory: vi.fn(),
  assertIsTransactionWithinSizeLimit: vi.fn(),
}));

vi.mock('@solana-program/token', () => ({
  TOKEN_PROGRAM_ADDRESS: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  findAssociatedTokenPda: vi.fn().mockResolvedValue(['mock-usdc-ata']),
  getCreateAssociatedTokenIdempotentInstruction: vi.fn(),
  getTransferCheckedInstruction: vi.fn(),
}));

vi.mock('./mpp/index.js', () => ({
  SOLANA_USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDC_DECIMALS: 6,
  parseAmountToRaw: vi.fn(),
  fetchTokenAccounts: vi.fn(),
  buildTransferPlan: vi.fn(),
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

describe('Solobank.getBalance()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SOL and USDC balances', async () => {
    mockGetBalance.mockResolvedValue({ value: 2_500_000_000n });
    mockGetTokenAccountBalance.mockResolvedValue({ value: { amount: '12500000' } });

    const sb = await createTestSolobank();
    const balance = await sb.getBalance();

    expect(balance.sol).toBe(2.5);
    expect(balance.solRaw).toBe(2_500_000_000n);
    expect(balance.usdc).toBe(12.5);
    expect(balance.usdcRaw).toBe(12_500_000n);
    expect(balance.address).toBe('AgentAddr111111111111111111111111111111111');
  });

  it('returns 0 USDC when token account does not exist', async () => {
    mockGetBalance.mockResolvedValue({ value: 1_000_000_000n });
    mockGetTokenAccountBalance.mockRejectedValue(new Error('Account not found'));

    const sb = await createTestSolobank();
    const balance = await sb.getBalance();

    expect(balance.sol).toBe(1);
    expect(balance.usdc).toBe(0);
    expect(balance.usdcRaw).toBe(0n);
  });

  it('balance() is an alias for getBalance()', async () => {
    mockGetBalance.mockResolvedValue({ value: 500_000_000n });
    mockGetTokenAccountBalance.mockResolvedValue({ value: { amount: '0' } });

    const sb = await createTestSolobank();
    const b1 = await sb.getBalance();
    const b2 = await sb.balance();

    expect(b1.sol).toBe(b2.sol);
  });

  it('includes rpcUrl in snapshot', async () => {
    mockGetBalance.mockResolvedValue({ value: 0n });
    mockGetTokenAccountBalance.mockRejectedValue(new Error('not found'));

    const sb = await createTestSolobank();
    const balance = await sb.getBalance();

    expect(balance.rpcUrl).toBeTruthy();
  });
});
