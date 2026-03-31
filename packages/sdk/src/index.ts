import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Mppx } from 'mppx/client';
import {
  SOLANA_USDC_MINT,
  USDC_DECIMALS,
  buildTransferPlan,
  fetchTokenAccounts,
  parseAmountToRaw,
  solanaClient,
  type SolanaTransactionSigner,
} from '@solobank/mpp-solana';
import {
  JUP_DECIMALS,
  JUP_MINT,
  KNOWN_ASSETS,
  SOL_DECIMALS,
  USDT_DECIMALS,
  USDT_MINT,
} from './assets.js';
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
export const DEFAULT_RPC_URL = clusterApiUrl(DEFAULT_CLUSTER);
export const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.config', 'solobank');
export const DEFAULT_KEYPAIR_FILENAME = 'id.json';

export const SUPPORTED_ASSETS = {
  SOL: { symbol: 'SOL', decimals: SOL_DECIMALS, mint: KNOWN_ASSETS.SOL.mint },
  USDC: { symbol: 'USDC', decimals: USDC_DECIMALS, mint: SOLANA_USDC_MINT },
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
}

export interface SolobankCreateOptions {
  configDir?: string;
  rpcUrl?: string;
  createIfMissing?: boolean;
  keypairPath?: string;
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

export async function saveSecretKey(secretKey: Uint8Array, configDir?: string, keypairPath?: string): Promise<string> {
  const resolvedPath = resolveKeypairPath(configDir, keypairPath);
  const directory = path.dirname(resolvedPath);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(resolvedPath, JSON.stringify(Array.from(secretKey), null, 2), 'utf8');
  return resolvedPath;
}

export async function loadSecretKey(configDir?: string, keypairPath?: string): Promise<Uint8Array> {
  const file = await fs.readFile(resolveKeypairPath(configDir, keypairPath), 'utf8');
  const parsed = JSON.parse(file);
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

export function truncateAddress(address: string, prefix = 4, suffix = 4): string {
  if (address.length <= prefix + suffix + 1) {
    return address;
  }
  return `${address.slice(0, prefix)}...${address.slice(-suffix)}`;
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

async function confirmAndSend(
  connection: Connection,
  signer: Keypair,
  transaction: Transaction,
): Promise<string> {
  const latest = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer ??= signer.publicKey;
  transaction.partialSign(signer);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    'confirmed',
  );

  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return signature;
}

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
  private constructor(
    readonly keypair: Keypair,
    readonly connection: Connection,
    readonly rpcUrl: string,
    readonly configDir?: string,
  ) {}

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
    const savedPath = await saveSecretKey(keypair.secretKey, configDir, keypairPath);

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

    const secretKey = await loadSecretKey(configDir, keypairPath);
    return Solobank.fromSecretKey(secretKey, {
      rpcUrl: options.rpcUrl,
      configDir,
    });
  }

  static async load(options: SolobankCreateOptions = {}): Promise<Solobank> {
    return Solobank.create(options);
  }

  static fromSecretKey(
    secretKey: string | Uint8Array | number[],
    options: { rpcUrl?: string; configDir?: string } = {},
  ): Solobank {
    const keypair = keypairFromPrivateKey(secretKey);
    const rpcUrl = resolveRpcUrl(options.rpcUrl);
    const connection = new Connection(rpcUrl, 'confirmed');
    return new Solobank(keypair, connection, rpcUrl, options.configDir);
  }

  getAddress(): string {
    return this.keypair.publicKey.toBase58();
  }

  address(): string {
    return this.getAddress();
  }

  get signer(): SolanaTransactionSigner {
    return {
      publicKey: this.keypair.publicKey,
      signTransaction: async (transaction) => {
        transaction.partialSign(this.keypair);
        return transaction;
      },
    };
  }

  async getBalance(): Promise<BalanceSnapshot> {
    const owner = this.keypair.publicKey;
    const mint = new PublicKey(SOLANA_USDC_MINT);
    const usdcAta = getAssociatedTokenAddressSync(
      mint,
      owner,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const lamports = await this.connection.getBalance(owner, 'confirmed');
    let usdcRaw = 0n;

    try {
      const tokenBalance = await this.connection.getTokenAccountBalance(usdcAta, 'confirmed');
      usdcRaw = BigInt(tokenBalance.value.amount);
    } catch {
      usdcRaw = 0n;
    }

    return {
      address: owner.toBase58(),
      sol: lamports / LAMPORTS_PER_SOL,
      solRaw: BigInt(lamports),
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
    const recipient = new PublicKey(options.to);

    if (asset === 'SOL') {
      const lamports = BigInt(Math.round(options.amount * LAMPORTS_PER_SOL));
      if (options.dryRun) {
        return {
          asset,
          amount: options.amount,
          signature: 'dry-run',
          explorerUrl: '',
        };
      }
      const transaction = new Transaction().add(SystemProgram.transfer({
        fromPubkey: this.keypair.publicKey,
        toPubkey: recipient,
        lamports: Number(lamports),
      }));

      const signature = await confirmAndSend(this.connection, this.keypair, transaction);
      return { asset, amount: options.amount, signature, explorerUrl: toExplorerUrl(signature) };
    }

    const mint = new PublicKey(options.mint ?? SOLANA_USDC_MINT);
    const amountRaw = parseAmountToRaw(String(options.amount), USDC_DECIMALS);
    const tokenAccounts = await fetchTokenAccounts(this.connection, this.keypair.publicKey, mint);
    if (tokenAccounts.length === 0) {
      throw new Error('No USDC balance available');
    }

    const totalBalance = tokenAccounts.reduce((sum, account) => sum + account.amount, 0n);
    if (totalBalance < amountRaw) {
      throw new Error('Insufficient USDC balance');
    }

    if (options.dryRun) {
      return {
        asset,
        amount: options.amount,
        signature: 'dry-run',
        explorerUrl: '',
      };
    }

    const recipientAta = getAssociatedTokenAddressSync(
      mint,
      recipient,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const transaction = new Transaction();
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        this.keypair.publicKey,
        recipientAta,
        recipient,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );

    const transferPlan = buildTransferPlan(tokenAccounts, amountRaw);
    for (const step of transferPlan) {
      transaction.add(
        createTransferCheckedInstruction(
          step.address,
          mint,
          recipientAta,
          this.keypair.publicKey,
          step.amount,
          USDC_DECIMALS,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );
    }

    const signature = await confirmAndSend(this.connection, this.keypair, transaction);
    return { asset, amount: options.amount, signature, explorerUrl: toExplorerUrl(signature) };
  }

  async pay(options: PayOptions): Promise<PayResult> {
    const client = Mppx.create({
      methods: [
        solanaClient({
          connection: this.connection,
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
    return toSwapExecutionResult(quote, signature);
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
    return executeLend(
      {
        ...options,
        rpcUrl: this.rpcUrl,
      },
      this.connection,
      this.keypair,
    );
  }

  async borrow(options: BorrowOptions): Promise<LendingActionResult> {
    return executeBorrow(
      {
        ...options,
        rpcUrl: this.rpcUrl,
      },
      this.connection,
      this.keypair,
    );
  }

  async withdraw(options: WithdrawOptions): Promise<LendingActionResult> {
    return executeWithdraw(
      {
        ...options,
        rpcUrl: this.rpcUrl,
      },
      this.connection,
      this.keypair,
    );
  }

  async repay(options: RepayOptions): Promise<LendingActionResult> {
    return executeRepay(
      {
        ...options,
        rpcUrl: this.rpcUrl,
      },
      this.connection,
      this.keypair,
    );
  }

  async rebalance(options: RebalanceOptions): Promise<RebalanceResult> {
    return executeRebalance(
      {
        ...options,
        rpcUrl: this.rpcUrl,
      },
      this.connection,
      this.keypair,
    );
  }
}
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
