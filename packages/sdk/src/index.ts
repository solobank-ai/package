import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encryptKeypair, decryptKeypair, isEncryptedFile } from './encryption.js';
import {
  address,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  pipe,
  compileTransaction,
  signTransaction,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  assertIsTransactionWithinSizeLimit,
  type KeyPairSigner,
} from '@solana/kit';
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from '@solana-program/token';
// Legacy — required by lending SDKs (marginfi, kamino) and Jupiter swap deserialization
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { Mppx } from 'mppx/client';
import {
  USDC_DECIMALS,
  buildTransferPlan,
  fetchTokenAccounts,
  parseAmountToRaw,
  solanaClient,
  getSolanaUsdcMint,
} from './mpp/index.js';
import {
  JUP_DECIMALS,
  JUP_MINT,
  KNOWN_ASSETS,
  SOL_DECIMALS,
  USDT_DECIMALS,
  USDT_MINT,
} from './assets.js';
import { SafeguardEnforcer as SafeguardEnforcerImpl } from './safeguards/enforcer.js';
import { collectFee } from './treasury.js';
import {
  borrow as executeBorrow,
  getLendingRates as loadLendingRates,
  lend as executeLend,
  rebalance as executeRebalance,
  repay as executeRepay,
  type LendOptions,
  type LendResult,
  type BorrowOptions,
  type LendingActionResult,
  type LendingProtocol,
  type LendingProtocolSelector,
  type LendingRate,
  type RebalanceOptions,
  type RebalanceResult,
  type RepayOptions,
  withdraw as executeWithdraw,
  type WithdrawOptions,
} from './lending.js';
import {
  getSwapQuote,
  getSwapTransaction,
  toSwapExecutionResult,
  type JupiterSwapMode,
  type SwapExecutionResult,
  type SwapQuoteOptions,
  type SwapQuoteResult,
} from './swap.js';

export const DEFAULT_CLUSTER = 'devnet';
export const DEFAULT_RPC_URL = clusterRpcUrl(DEFAULT_CLUSTER);
export const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.config', 'solobank');
export const DEFAULT_KEYPAIR_FILENAME = 'id.json';

const LAMPORTS_PER_SOL = 1_000_000_000;
const SYSTEM_PROGRAM_ADDRESS = address('11111111111111111111111111111111');

function clusterRpcUrl(cluster: string): string {
  switch (cluster) {
    case 'mainnet-beta': return 'https://api.mainnet-beta.solana.com';
    case 'devnet': return 'https://api.devnet.solana.com';
    case 'testnet': return 'https://api.testnet.solana.com';
    default: return `https://api.${cluster}.solana.com`;
  }
}

export const SUPPORTED_ASSETS = {
  SOL: { symbol: 'SOL', decimals: SOL_DECIMALS, mint: KNOWN_ASSETS.SOL.mint },
  get USDC() { return { symbol: 'USDC' as const, decimals: USDC_DECIMALS, mint: getSolanaUsdcMint() }; },
  USDT: { symbol: 'USDT', decimals: USDT_DECIMALS, mint: USDT_MINT },
  JUP: { symbol: 'JUP', decimals: JUP_DECIMALS, mint: JUP_MINT },
} as const;

export type SupportedAsset = keyof typeof SUPPORTED_ASSETS;

export interface BalanceSnapshot {
  address: string;
  sol: number;
  solRaw: bigint;
  usdc: number;
  usdcRaw: bigint;
  rpcUrl: string;
}

export interface SendOptions {
  amount: number;
  to: string;
  asset?: SupportedAsset;
  mint?: string;
  dryRun?: boolean;
}

export interface SendResult {
  asset: SupportedAsset;
  amount: number;
  signature: string;
  explorerUrl: string;
}

export interface PayOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  maxPrice?: number;
}

export interface PayResult {
  status: number;
  ok: boolean;
  contentType: string;
  data: unknown;
}

export interface SwapOptions extends SwapQuoteOptions {
  dryRun?: boolean;
}

export interface SolobankInitOptions {
  configDir?: string;
  force?: boolean;
  rpcUrl?: string;
  keypairPath?: string;
  password?: string;
}

export interface SolobankCreateOptions {
  configDir?: string;
  rpcUrl?: string;
  createIfMissing?: boolean;
  keypairPath?: string;
  password?: string;
}

export function resolveConfigDir(configDir?: string): string {
  return configDir ?? process.env.SOLOBANK_CONFIG_DIR ?? DEFAULT_CONFIG_DIR;
}

export function resolveRpcUrl(rpcUrl?: string): string {
  return rpcUrl ?? process.env.SOLOBANK_RPC_URL ?? DEFAULT_RPC_URL;
}

export function resolveKeypairPath(configDir?: string, keypairPath?: string): string {
  return keypairPath ?? path.join(resolveConfigDir(configDir), DEFAULT_KEYPAIR_FILENAME);
}

export async function walletExists(configDir?: string, keypairPath?: string): Promise<boolean> {
  try {
    await fs.access(resolveKeypairPath(configDir, keypairPath));
    return true;
  } catch {
    return false;
  }
}

export async function saveSecretKey(secretKey: Uint8Array, configDir?: string, keypairPath?: string, password?: string): Promise<string> {
  const resolvedPath = resolveKeypairPath(configDir, keypairPath);
  const directory = path.dirname(resolvedPath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const content = password
    ? JSON.stringify(encryptKeypair(secretKey, password), null, 2)
    : JSON.stringify(Array.from(secretKey), null, 2);
  await fs.writeFile(resolvedPath, content, { encoding: 'utf8', mode: 0o600 });
  return resolvedPath;
}

export async function loadSecretKey(configDir?: string, keypairPath?: string, password?: string): Promise<Uint8Array> {
  const file = await fs.readFile(resolveKeypairPath(configDir, keypairPath), 'utf8');
  const parsed = JSON.parse(file);
  if (isEncryptedFile(parsed)) {
    if (!password) {
      throw new Error('Keypair is encrypted. Provide a password to decrypt.');
    }
    return decryptKeypair(parsed, password);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Keypair file must contain a JSON array of bytes');
  }
  return Uint8Array.from(parsed);
}

export function keypairFromPrivateKey(privateKey: string | Uint8Array | number[]): Keypair {
  if (privateKey instanceof Uint8Array) {
    return Keypair.fromSecretKey(privateKey);
  }

  if (Array.isArray(privateKey)) {
    return Keypair.fromSecretKey(Uint8Array.from(privateKey));
  }

  const trimmed = privateKey.trim();
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }

  return Keypair.fromSecretKey(Buffer.from(trimmed, 'base64'));
}

export function truncateAddress(addr: string, prefix = 4, suffix = 4): string {
  if (addr.length <= prefix + suffix + 1) {
    return addr;
  }
  return `${addr.slice(0, prefix)}...${addr.slice(-suffix)}`;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatAssetAmount(amount: number, asset: string): string {
  const decimals = asset === 'SOL' ? 4 : 2;
  return `${amount.toFixed(decimals)} ${asset}`;
}

function toExplorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

function createSolTransferInstruction(
  from: string,
  to: string,
  amountLamports: bigint,
) {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setUint32(4, Number(amountLamports & 0xFFFFFFFFn), true);
  view.setUint32(8, Number(amountLamports >> 32n), true);
  return {
    programAddress: SYSTEM_PROGRAM_ADDRESS,
    accounts: [
      { address: address(from), role: 3 },
      { address: address(to), role: 1 },
    ],
    data,
  };
}

/** Sign a versioned transaction from Jupiter and send it (legacy web3.js path). */
async function confirmAndSendVersioned(
  connection: Connection,
  signer: Keypair,
  transaction: VersionedTransaction,
): Promise<string> {
  transaction.sign([signer]);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return signature;
}

export class Solobank {
  private readonly rpc: ReturnType<typeof createSolanaRpc>;
  private readonly rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>;
  readonly enforcer: SafeguardEnforcerImpl;

  private constructor(
    readonly keyPairSigner: KeyPairSigner,
    readonly rpcUrl: string,
    /** @internal Kept for lending SDKs and Jupiter swap compatibility. */
    readonly connection: Connection,
    /** @internal Kept for lending SDKs and Jupiter swap compatibility. */
    readonly keypair: Keypair,
    readonly configDir?: string,
  ) {
    this.rpc = createSolanaRpc(rpcUrl);
    const wsUrl = rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    this.rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl);

    this.enforcer = new SafeguardEnforcerImpl(configDir ?? resolveConfigDir());
    this.enforcer.load();
  }

  static async init(options: SolobankInitOptions = {}): Promise<{
    address: string;
    keypairPath: string;
    rpcUrl: string;
  }> {
    const configDir = resolveConfigDir(options.configDir);
    const keypairPath = resolveKeypairPath(configDir, options.keypairPath);

    if (!options.force && await walletExists(configDir, keypairPath)) {
      throw new Error(`Wallet already exists at ${keypairPath}`);
    }

    const keypair = Keypair.generate();
    const savedPath = await saveSecretKey(keypair.secretKey, configDir, keypairPath, options.password);

    return {
      address: keypair.publicKey.toBase58(),
      keypairPath: savedPath,
      rpcUrl: resolveRpcUrl(options.rpcUrl),
    };
  }

  static async create(options: SolobankCreateOptions = {}): Promise<Solobank> {
    const configDir = resolveConfigDir(options.configDir);
    const keypairPath = resolveKeypairPath(configDir, options.keypairPath);

    if (!await walletExists(configDir, keypairPath)) {
      if (!options.createIfMissing) {
        throw new Error(`Wallet not found at ${keypairPath}. Run "solobank init" first.`);
      }
      await Solobank.init({ configDir, rpcUrl: options.rpcUrl, keypairPath });
    }

    const secretKey = await loadSecretKey(configDir, keypairPath, options.password);
    return Solobank.fromSecretKey(secretKey, {
      rpcUrl: options.rpcUrl,
      configDir,
    });
  }

  static async load(options: SolobankCreateOptions = {}): Promise<Solobank> {
    return Solobank.create(options);
  }

  static async fromSecretKey(
    secretKey: string | Uint8Array | number[],
    options: { rpcUrl?: string; configDir?: string } = {},
  ): Promise<Solobank> {
    const keypair = keypairFromPrivateKey(secretKey);
    const rpcUrl = resolveRpcUrl(options.rpcUrl);
    const connection = new Connection(rpcUrl, 'confirmed');
    const keyPairSigner = await createKeyPairSignerFromBytes(keypair.secretKey);
    return new Solobank(keyPairSigner, rpcUrl, connection, keypair, options.configDir);
  }

  getAddress(): string {
    return this.keyPairSigner.address;
  }

  address(): string {
    return this.getAddress();
  }

  get signer(): KeyPairSigner {
    return this.keyPairSigner;
  }

  private async buildSignAndSend(instructions: readonly any[]): Promise<string> {
    const { value: latestBlockhash } = await this.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    const txMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(this.keyPairSigner.address, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    );

    const compiled = compileTransaction(txMessage);
    const signed = await signTransaction([this.keyPairSigner.keyPair], compiled);

    assertIsTransactionWithinSizeLimit(signed);
    const sendAndConfirm = sendAndConfirmTransactionFactory({
      rpc: this.rpc as any,
      rpcSubscriptions: this.rpcSubscriptions as any,
    });
    await sendAndConfirm(signed, { commitment: 'confirmed' });

    return getSignatureFromTransaction(signed);
  }

  async getBalance(): Promise<BalanceSnapshot> {
    const ownerAddress = this.keyPairSigner.address;

    const [usdcAta] = await findAssociatedTokenPda({
      owner: ownerAddress,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      mint: getSolanaUsdcMint(),
    });

    const balanceResult = await this.rpc.getBalance(ownerAddress, { commitment: 'confirmed' }).send();
    const solLamports = balanceResult.value;

    let usdcRaw = 0n;
    try {
      const tokenBalance = await this.rpc.getTokenAccountBalance(usdcAta, { commitment: 'confirmed' }).send();
      usdcRaw = BigInt(tokenBalance.value.amount);
    } catch {
      usdcRaw = 0n;
    }

    return {
      address: ownerAddress,
      sol: Number(solLamports) / LAMPORTS_PER_SOL,
      solRaw: solLamports,
      usdc: Number(usdcRaw) / 10 ** USDC_DECIMALS,
      usdcRaw,
      rpcUrl: this.rpcUrl,
    };
  }

  async balance(): Promise<BalanceSnapshot> {
    return this.getBalance();
  }

  async send(options: SendOptions): Promise<SendResult> {
    const asset = (options.asset ?? 'USDC').toUpperCase() as SupportedAsset;
    const recipientAddr = options.to;

    if (asset === 'SOL') {
      const lamportsBig = BigInt(Math.round(options.amount * LAMPORTS_PER_SOL));
      if (options.dryRun) {
        return { asset, amount: options.amount, signature: 'dry-run', explorerUrl: '' };
      }

      const ix = createSolTransferInstruction(this.keyPairSigner.address, recipientAddr, lamportsBig);
      const signature = await this.buildSignAndSend([ix]);
      return { asset, amount: options.amount, signature, explorerUrl: toExplorerUrl(signature) };
    }

    const mint = address(options.mint ?? getSolanaUsdcMint());
    const amountRaw = parseAmountToRaw(String(options.amount), USDC_DECIMALS);
    const tokenAccounts = await fetchTokenAccounts(this.rpc, this.keyPairSigner.address, mint);
    if (tokenAccounts.length === 0) {
      throw new Error('No USDC balance available');
    }

    const totalBalance = tokenAccounts.reduce((sum, account) => sum + account.amount, 0n);
    if (totalBalance < amountRaw) {
      throw new Error('Insufficient USDC balance');
    }

    if (options.dryRun) {
      return { asset, amount: options.amount, signature: 'dry-run', explorerUrl: '' };
    }

    const recipientOwner = address(recipientAddr);
    const [recipientAta] = await findAssociatedTokenPda({
      owner: recipientOwner,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      mint,
    });

    const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: this.keyPairSigner,
      ata: recipientAta,
      owner: recipientOwner,
      mint,
    });

    const transferPlan = buildTransferPlan(tokenAccounts, amountRaw);
    const transferIxs = transferPlan.map((step) =>
      getTransferCheckedInstruction({
        source: step.address,
        mint,
        destination: recipientAta,
        authority: this.keyPairSigner,
        amount: step.amount,
        decimals: USDC_DECIMALS,
      }),
    );

    const signature = await this.buildSignAndSend([createAtaIx, ...transferIxs]);
    return { asset, amount: options.amount, signature, explorerUrl: toExplorerUrl(signature) };
  }

  async pay(options: PayOptions): Promise<PayResult> {
    const client = Mppx.create({
      methods: [
        solanaClient({
          rpcUrl: this.rpcUrl,
          signer: this.signer,
        }),
      ],
      polyfill: false,
      onChallenge: async (challenge, helpers) => {
        const requested = Number(challenge.request?.amount ?? 0);
        if (options.maxPrice !== undefined && requested > options.maxPrice) {
          throw new Error(`MPP price ${requested} exceeds maxPrice ${options.maxPrice}`);
        }
        return helpers.createCredential();
      },
    });

    const headers = { ...(options.headers ?? {}) };
    const init: RequestInit = { method: options.method ?? 'GET', headers };

    if (options.body !== undefined) {
      if (typeof options.body === 'string') {
        init.body = options.body;
      } else {
        init.body = JSON.stringify(options.body);
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }
    }

    const response = await client.fetch(options.url, init);
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    let data: unknown = text;

    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      status: response.status,
      ok: response.ok,
      contentType,
      data,
    };
  }

  async getSwapQuote(options: SwapQuoteOptions): Promise<SwapQuoteResult> {
    return getSwapQuote(options);
  }

  async swap(options: SwapOptions): Promise<SwapExecutionResult> {
    const quote = await getSwapQuote(options);
    if (options.dryRun) {
      return toSwapExecutionResult(quote, 'dry-run');
    }

    const transaction = await getSwapTransaction(quote, this.getAddress());
    const signature = await confirmAndSendVersioned(this.connection, this.keypair, transaction);
    const result = toSwapExecutionResult(quote, signature);
    await this.tryCollectFee('swap', BigInt(quote.inAmountRaw));
    return result;
  }

  async getLendingRates(options: { asset: string; protocol?: LendingProtocolSelector }): Promise<LendingRate[]> {
    return loadLendingRates(
      {
        asset: options.asset,
        protocol: options.protocol,
        rpcUrl: this.rpcUrl,
      },
      this.connection,
    );
  }

  async lend(options: LendOptions): Promise<LendResult> {
    const result = await executeLend(
      { ...options, rpcUrl: this.rpcUrl },
      this.connection,
      this.keypair,
    );
    const amountRaw = BigInt(Math.round(options.amount * 10 ** USDC_DECIMALS));
    await this.tryCollectFee('save', amountRaw);
    return result;
  }

  async borrow(options: BorrowOptions): Promise<LendingActionResult> {
    const result = await executeBorrow(
      { ...options, rpcUrl: this.rpcUrl },
      this.connection,
      this.keypair,
    );
    const amountRaw = BigInt(Math.round(options.amount * 10 ** USDC_DECIMALS));
    await this.tryCollectFee('borrow', amountRaw);
    return result;
  }

  /**
   * Best-effort fee collection. Failures (e.g. insufficient USDC for the fee,
   * network issues) are swallowed and logged — the main operation already succeeded.
   */
  private async tryCollectFee(operation: 'save' | 'borrow' | 'swap', amountRaw: bigint): Promise<void> {
    try {
      await collectFee({
        connection: this.connection,
        keypair: this.keypair,
        rpcUrl: this.rpcUrl,
        operation,
        amountRaw,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[solobank] Fee collection failed for ${operation}: ${msg}`);
    }
  }

  async withdraw(options: WithdrawOptions): Promise<LendingActionResult> {
    return executeWithdraw(
      { ...options, rpcUrl: this.rpcUrl },
      this.connection,
      this.keypair,
    );
  }

  async repay(options: RepayOptions): Promise<LendingActionResult> {
    return executeRepay(
      { ...options, rpcUrl: this.rpcUrl },
      this.connection,
      this.keypair,
    );
  }

  async rebalance(options: RebalanceOptions): Promise<RebalanceResult> {
    return executeRebalance(
      { ...options, rpcUrl: this.rpcUrl },
      this.connection,
      this.keypair,
    );
  }
}

export {
  SafeguardEnforcer,
  SafeguardError,
  OUTBOUND_OPS,
  DEFAULT_SAFEGUARD_CONFIG,
} from './safeguards/index.js';
export type {
  SafeguardConfig,
  TxMetadata,
  SafeguardRule,
  SafeguardErrorDetails,
} from './safeguards/index.js';

// Legacy safeguard exports (for CLI backwards compatibility)
export {
  loadSafeguardConfig,
  saveSafeguardConfig,
  checkTransaction,
  recordTransaction,
  lockWallet,
  unlockWallet,
} from './safeguards.js';

export { encryptKeypair, decryptKeypair, isEncryptedFile } from './encryption.js';
export type { EncryptedKeypairFile } from './encryption.js';

export { SolobankError, mapWalletError, isRetryable } from './errors.js';
export type { SolobankErrorCode } from './errors.js';

export { ContactManager } from './contacts.js';

export { getHistory, getTransactionDetail } from './history.js';
export type { TransactionRecord, TransactionDetail, TransactionType, GetHistoryOptions } from './history.js';

export { resolvePin, saveSession, clearSession, validatePin, createPinEncryptedKeypair } from './session.js';

export {
  collectFee,
  TREASURY_PROGRAM_ID,
  TREASURY_WALLET,
  TREASURY_FEE_MINT_DEVNET,
  TREASURY_FEE_MINT_MAINNET,
} from './treasury.js';
export type { FeeOperation, CollectFeeParams, CollectFeeResult } from './treasury.js';

export type {
  BorrowOptions,
  JupiterSwapMode,
  LendOptions,
  LendingActionResult,
  LendResult,
  LendingProtocol,
  LendingProtocolSelector,
  LendingRate,
  RebalanceOptions,
  RebalanceResult,
  RepayOptions,
  SwapExecutionResult,
  SwapQuoteOptions,
  SwapQuoteResult,
  WithdrawOptions,
};
