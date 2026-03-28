import BN from 'bn.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { address, createKeyPairSignerFromBytes } from '@solana/kit';
import { Scope } from '@kamino-finance/scope-sdk';
import {
  DEFAULT_RECENT_SLOT_DURATION_MS,
  KaminoAction,
  KaminoManager,
  VanillaObligation,
} from '@kamino-finance/klend-sdk';
import { MarginfiClient, getConfig } from '@mrgnlabs/marginfi-client-v2';
import { NodeWallet } from '@mrgnlabs/mrgn-common';
import { CliConnectionPool } from '@kamino-finance/klend-sdk/dist/client/tx/CliConnectionPool.js';
import { sendAndConfirmTx } from '@kamino-finance/klend-sdk/dist/client/tx/tx.js';
import type { Chain } from '@kamino-finance/klend-sdk/dist/client/tx/rpc.js';
import { ResolvedAsset, resolveAsset } from './assets.js';

export type LendingProtocol = 'kamino' | 'marginfi';
export type LendingProtocolSelector = LendingProtocol | 'auto';

export interface LendingRate {
  protocol: LendingProtocol;
  asset: string;
  mint: string;
  apy: number;
  apr?: number;
  marketAddress: string;
  reserveAddress?: string;
  bankAddress?: string;
  decimals: number;
  metadata?: Record<string, string>;
}

export interface LendingRateOptions {
  asset: string;
  protocol?: LendingProtocolSelector;
  rpcUrl: string;
}

export interface LendOptions {
  asset: string;
  amount: number;
  protocol?: LendingProtocolSelector;
  dryRun?: boolean;
}

export interface LendResult {
  protocol: LendingProtocol;
  asset: string;
  amount: number;
  apy: number;
  marketAddress: string;
  reserveAddress?: string;
  bankAddress?: string;
  signature: string;
}

export interface LendingActionTarget {
  protocol?: LendingProtocolSelector;
  marketAddress?: string;
  reserveAddress?: string;
  bankAddress?: string;
}

export interface BorrowOptions extends LendingActionTarget {
  asset: string;
  amount: number;
  dryRun?: boolean;
}

export interface WithdrawOptions extends LendingActionTarget {
  asset: string;
  amount: number;
  withdrawAll?: boolean;
  dryRun?: boolean;
}

export interface RepayOptions extends LendingActionTarget {
  asset: string;
  amount: number;
  repayAll?: boolean;
  dryRun?: boolean;
}

export interface LendingActionResult {
  protocol: LendingProtocol;
  asset: string;
  amount: number;
  apy: number;
  marketAddress: string;
  reserveAddress?: string;
  bankAddress?: string;
  signature: string;
}

export interface RebalanceOptions extends LendingActionTarget {
  asset: string;
  amount: number;
  targetProtocol?: LendingProtocolSelector;
  minApyDelta?: number;
  dryRun?: boolean;
}

export interface RebalanceResult {
  status: 'rebalanced' | 'skipped';
  asset: string;
  amount: number;
  from: LendingRate;
  to: LendingRate;
  apyDelta: number;
  withdrawSignature?: string;
  lendSignature?: string;
  reason?: string;
}

function inferCluster(rpcUrl: string): 'mainnet-beta' | 'devnet' | 'localnet' {
  if (rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')) {
    return 'localnet';
  }
  if (rpcUrl.includes('devnet')) {
    return 'devnet';
  }
  return 'mainnet-beta';
}

function inferMarginfiEnvironment(rpcUrl: string): 'production' | 'dev' {
  return inferCluster(rpcUrl) === 'devnet' ? 'dev' : 'production';
}

function createKaminoChain(rpcUrl: string): Chain {
  const cluster = inferCluster(rpcUrl);
  const wsUrl = rpcUrl.startsWith('https://')
    ? rpcUrl.replace('https://', 'wss://')
    : rpcUrl.replace('http://', 'ws://');

  return {
    name: cluster,
    endpoint: {
      url: rpcUrl,
      name: cluster,
    },
    wsEndpoint: {
      url: wsUrl,
      name: `${cluster}-ws`,
    },
    multicastEndpoints: [],
  };
}

function parseUiAmountToRaw(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Lending amount must be a positive number. Received ${amount}`);
  }

  const factor = 10 ** decimals;
  return String(Math.round(amount * factor));
}

function normalizeApy(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function sortRatesDescending(rates: LendingRate[]): LendingRate[] {
  return [...rates].sort((left, right) => right.apy - left.apy);
}

function asMarginfiWalletKeypair(keypair: Keypair): ConstructorParameters<typeof NodeWallet>[0] {
  return keypair as unknown as ConstructorParameters<typeof NodeWallet>[0];
}

async function getMarginfiRates(
  connection: Connection,
  rpcUrl: string,
  asset: ResolvedAsset,
): Promise<LendingRate[]> {
  const wallet = new NodeWallet(asMarginfiWalletKeypair(Keypair.generate()));
  const client = await MarginfiClient.fetch(
    getConfig(inferMarginfiEnvironment(rpcUrl)),
    wallet,
    connection,
    { readOnly: true },
  );

  const matchingBanks = [...client.banks.values()].filter((bank) => {
    if (bank.mint.equals(new PublicKey(asset.mint))) {
      return true;
    }

    return bank.tokenSymbol?.toUpperCase() === asset.symbol.toUpperCase();
  });

  return matchingBanks.map((bank) => {
    const rates = bank.computeInterestRates();
    return {
      protocol: 'marginfi',
      asset: bank.tokenSymbol ?? asset.symbol,
      mint: bank.mint.toBase58(),
      apy: normalizeApy(rates.lendingRate.toNumber()),
      apr: rates.lendingRate.toNumber(),
      marketAddress: client.groupAddress.toBase58(),
      bankAddress: bank.address.toBase58(),
      decimals: bank.mintDecimals,
      metadata: {
        groupAddress: client.groupAddress.toBase58(),
      },
    } satisfies LendingRate;
  });
}

async function getKaminoRates(
  rpcUrl: string,
  asset: ResolvedAsset,
): Promise<LendingRate[]> {
  const pool = new CliConnectionPool(createKaminoChain(rpcUrl));
  const manager = new KaminoManager(pool.rpc, DEFAULT_RECENT_SLOT_DURATION_MS);
  const [markets, currentSlot] = await Promise.all([
    manager.getAllMarkets(),
    pool.rpc.getSlot({ commitment: 'confirmed' }).send(),
  ]);

  const opportunities: LendingRate[] = [];
  for (const market of markets) {
    for (const reserve of market.getReserves()) {
      const reserveMint = String(reserve.getLiquidityMint());
      const reserveSymbol = reserve.getTokenSymbol();
      if (reserveMint !== asset.mint && reserveSymbol.toUpperCase() !== asset.symbol.toUpperCase()) {
        continue;
      }

      opportunities.push({
        protocol: 'kamino',
        asset: reserveSymbol,
        mint: reserveMint,
        apy: normalizeApy(reserve.totalSupplyAPY(currentSlot)),
        apr: reserve.calculateSupplyAPR(currentSlot, 0),
        marketAddress: String(market.getAddress()),
        reserveAddress: String(reserve.address),
        decimals: reserve.getMintDecimals(),
        metadata: {
          marketName: market.getName(),
        },
      });
    }
  }

  return opportunities;
}

export async function getLendingRates(options: LendingRateOptions, connection: Connection): Promise<LendingRate[]> {
  const asset = resolveAsset(options.asset);
  const protocol = options.protocol ?? 'auto';
  const rates: LendingRate[] = [];

  if (protocol === 'auto' || protocol === 'marginfi') {
    rates.push(...await getMarginfiRates(connection, options.rpcUrl, asset));
  }

  if (protocol === 'auto' || protocol === 'kamino') {
    rates.push(...await getKaminoRates(options.rpcUrl, asset));
  }

  return sortRatesDescending(rates);
}

export function pickBestLendingRate(rates: LendingRate[], protocol: LendingProtocolSelector = 'auto'): LendingRate {
  const filtered = protocol === 'auto' ? rates : rates.filter((rate) => rate.protocol === protocol);
  const best = sortRatesDescending(filtered)[0];
  if (!best) {
    throw new Error(`No lending opportunities found for protocol ${protocol}`);
  }
  return best;
}

function resolveOpportunity(rates: LendingRate[], target: LendingActionTarget): LendingRate {
  let filtered = rates;

  if (target.protocol && target.protocol !== 'auto') {
    filtered = filtered.filter((rate) => rate.protocol === target.protocol);
  }
  if (target.marketAddress) {
    filtered = filtered.filter((rate) => rate.marketAddress === target.marketAddress);
  }
  if (target.reserveAddress) {
    filtered = filtered.filter((rate) => rate.reserveAddress === target.reserveAddress);
  }
  if (target.bankAddress) {
    filtered = filtered.filter((rate) => rate.bankAddress === target.bankAddress);
  }

  const best = sortRatesDescending(filtered)[0];
  if (!best) {
    throw new Error('No lending opportunity matched the requested asset/protocol/target');
  }
  return best;
}

function isSameOpportunity(left: LendingRate, right: LendingRate): boolean {
  return left.protocol === right.protocol
    && left.marketAddress === right.marketAddress
    && left.reserveAddress === right.reserveAddress
    && left.bankAddress === right.bankAddress;
}

export function pickRebalanceTarget(
  rates: LendingRate[],
  current: LendingRate,
  protocol: LendingProtocolSelector = 'auto',
): LendingRate | undefined {
  const filtered = protocol === 'auto'
    ? rates
    : rates.filter((rate) => rate.protocol === protocol);

  return sortRatesDescending(filtered).find((rate) => !isSameOpportunity(rate, current));
}

async function getExistingMarginfiAccount(
  connection: Connection,
  rpcUrl: string,
  keypair: Keypair,
): Promise<{
  client: MarginfiClient;
  wallet: NodeWallet;
  account: Awaited<ReturnType<MarginfiClient['getMarginfiAccountsForAuthority']>>[number];
}> {
  const wallet = new NodeWallet(asMarginfiWalletKeypair(keypair));
  const client = await MarginfiClient.fetch(
    getConfig(inferMarginfiEnvironment(rpcUrl)),
    wallet,
    connection,
    { readOnly: false },
  );
  const accounts = await client.getMarginfiAccountsForAuthority(wallet.publicKey);
  const account = accounts[0];
  if (!account) {
    throw new Error('No marginfi account found for this wallet. Deposit collateral first or create an account by lending.');
  }
  return { client, wallet, account };
}

async function lendWithMarginfi(
  connection: Connection,
  rpcUrl: string,
  keypair: Keypair,
  opportunity: LendingRate,
  amount: number,
  dryRun = false,
): Promise<LendResult> {
  const wallet = new NodeWallet(asMarginfiWalletKeypair(keypair));
  const client = await MarginfiClient.fetch(
    getConfig(inferMarginfiEnvironment(rpcUrl)),
    wallet,
    connection,
    { readOnly: false },
  );

  const bankAddress = opportunity.bankAddress;
  if (!bankAddress) {
    throw new Error('marginfi opportunity is missing bankAddress');
  }

  if (dryRun) {
    return {
      protocol: 'marginfi',
      asset: opportunity.asset,
      amount,
      apy: opportunity.apy,
      marketAddress: opportunity.marketAddress,
      bankAddress,
      signature: 'dry-run',
    };
  }

  const accounts = await client.getMarginfiAccountsForAuthority(wallet.publicKey);
  const account = accounts[0] ?? await client.createMarginfiAccount();
  const signature = await account.deposit(amount, new PublicKey(bankAddress));

  return {
    protocol: 'marginfi',
    asset: opportunity.asset,
    amount,
    apy: opportunity.apy,
    marketAddress: opportunity.marketAddress,
    bankAddress,
    signature,
  };
}

async function lendWithKamino(
  keypair: Keypair,
  rpcUrl: string,
  opportunity: LendingRate,
  amount: number,
  dryRun = false,
): Promise<LendResult> {
  const reserveAddress = opportunity.reserveAddress;
  if (!reserveAddress) {
    throw new Error('Kamino opportunity is missing reserveAddress');
  }

  const pool = new CliConnectionPool(createKaminoChain(rpcUrl));
  const manager = new KaminoManager(pool.rpc, DEFAULT_RECENT_SLOT_DURATION_MS);
  const markets = await manager.getAllMarkets();
  const market = markets.find((entry) => String(entry.getAddress()) === opportunity.marketAddress);
  if (!market) {
    throw new Error(`Kamino market ${opportunity.marketAddress} not found`);
  }

  const reserve = market.getReserveByAddress(address(reserveAddress));
  if (!reserve) {
    throw new Error(`Kamino reserve ${reserveAddress} not found`);
  }

  if (dryRun) {
    return {
      protocol: 'kamino',
      asset: opportunity.asset,
      amount,
      apy: opportunity.apy,
      marketAddress: opportunity.marketAddress,
      reserveAddress,
      signature: 'dry-run',
    };
  }

  const signer = await createKeyPairSignerFromBytes(keypair.secretKey);
  const scope = new Scope(inferCluster(rpcUrl), pool.rpc);
  const amountRaw = new BN(parseUiAmountToRaw(amount, opportunity.decimals));
  const kaminoAction = await KaminoAction.buildDepositTxns(
    market,
    amountRaw,
    reserve.getLiquidityMint(),
    signer,
    new VanillaObligation(market.programId),
    true,
    {
      scope,
      scopeConfigurations: await scope.getAllConfigurations(),
    },
  );

  const signature = await sendAndConfirmTx(pool, signer, KaminoAction.actionToIxs(kaminoAction));
  return {
    protocol: 'kamino',
    asset: opportunity.asset,
    amount,
    apy: opportunity.apy,
    marketAddress: opportunity.marketAddress,
    reserveAddress,
    signature: String(signature),
  };
}

async function borrowWithMarginfi(
  connection: Connection,
  rpcUrl: string,
  keypair: Keypair,
  opportunity: LendingRate,
  amount: number,
  dryRun = false,
): Promise<LendingActionResult> {
  const { account } = await getExistingMarginfiAccount(connection, rpcUrl, keypair);
  const bankAddress = opportunity.bankAddress;
  if (!bankAddress) {
    throw new Error('marginfi opportunity is missing bankAddress');
  }

  if (dryRun) {
    return {
      protocol: 'marginfi',
      asset: opportunity.asset,
      amount,
      apy: opportunity.apy,
      marketAddress: opportunity.marketAddress,
      bankAddress,
      signature: 'dry-run',
    };
  }

  const signatures = await account.borrow(amount, new PublicKey(bankAddress));
  return {
    protocol: 'marginfi',
    asset: opportunity.asset,
    amount,
    apy: opportunity.apy,
    marketAddress: opportunity.marketAddress,
    bankAddress,
    signature: signatures[symbolsLastIndex(signatures)] ?? '',
  };
}

async function withdrawWithMarginfi(
  connection: Connection,
  rpcUrl: string,
  keypair: Keypair,
  opportunity: LendingRate,
  amount: number,
  withdrawAll = false,
  dryRun = false,
): Promise<LendingActionResult> {
  const { account } = await getExistingMarginfiAccount(connection, rpcUrl, keypair);
  const bankAddress = opportunity.bankAddress;
  if (!bankAddress) {
    throw new Error('marginfi opportunity is missing bankAddress');
  }

  if (dryRun) {
    return {
      protocol: 'marginfi',
      asset: opportunity.asset,
      amount,
      apy: opportunity.apy,
      marketAddress: opportunity.marketAddress,
      bankAddress,
      signature: 'dry-run',
    };
  }

  const signatures = await account.withdraw(amount, new PublicKey(bankAddress), withdrawAll);
  return {
    protocol: 'marginfi',
    asset: opportunity.asset,
    amount,
    apy: opportunity.apy,
    marketAddress: opportunity.marketAddress,
    bankAddress,
    signature: signatures[symbolsLastIndex(signatures)] ?? '',
  };
}

async function repayWithMarginfi(
  connection: Connection,
  rpcUrl: string,
  keypair: Keypair,
  opportunity: LendingRate,
  amount: number,
  repayAll = false,
  dryRun = false,
): Promise<LendingActionResult> {
  const { account } = await getExistingMarginfiAccount(connection, rpcUrl, keypair);
  const bankAddress = opportunity.bankAddress;
  if (!bankAddress) {
    throw new Error('marginfi opportunity is missing bankAddress');
  }

  if (dryRun) {
    return {
      protocol: 'marginfi',
      asset: opportunity.asset,
      amount,
      apy: opportunity.apy,
      marketAddress: opportunity.marketAddress,
      bankAddress,
      signature: 'dry-run',
    };
  }

  const signature = await account.repay(amount, new PublicKey(bankAddress), repayAll);
  return {
    protocol: 'marginfi',
    asset: opportunity.asset,
    amount,
    apy: opportunity.apy,
    marketAddress: opportunity.marketAddress,
    bankAddress,
    signature,
  };
}

async function buildKaminoContext(
  rpcUrl: string,
  opportunity: LendingRate,
  keypair: Keypair,
) {
  const reserveAddress = opportunity.reserveAddress;
  if (!reserveAddress) {
    throw new Error('Kamino opportunity is missing reserveAddress');
  }

  const pool = new CliConnectionPool(createKaminoChain(rpcUrl));
  const manager = new KaminoManager(pool.rpc, DEFAULT_RECENT_SLOT_DURATION_MS);
  const markets = await manager.getAllMarkets();
  const market = markets.find((entry) => String(entry.getAddress()) === opportunity.marketAddress);
  if (!market) {
    throw new Error(`Kamino market ${opportunity.marketAddress} not found`);
  }

  const reserve = market.getReserveByAddress(address(reserveAddress));
  if (!reserve) {
    throw new Error(`Kamino reserve ${reserveAddress} not found`);
  }

  const signer = await createKeyPairSignerFromBytes(keypair.secretKey);
  const scope = new Scope(inferCluster(rpcUrl), pool.rpc);
  return { pool, market, reserve, signer, scope };
}

async function borrowWithKamino(
  keypair: Keypair,
  rpcUrl: string,
  opportunity: LendingRate,
  amount: number,
  dryRun = false,
): Promise<LendingActionResult> {
  if (dryRun) {
    return {
      protocol: 'kamino',
      asset: opportunity.asset,
      amount,
      apy: opportunity.apy,
      marketAddress: opportunity.marketAddress,
      reserveAddress: opportunity.reserveAddress,
      signature: 'dry-run',
    };
  }

  const { pool, market, reserve, signer, scope } = await buildKaminoContext(rpcUrl, opportunity, keypair);
  const amountRaw = new BN(parseUiAmountToRaw(amount, opportunity.decimals));
  const kaminoAction = await KaminoAction.buildBorrowTxns(
    market,
    amountRaw,
    reserve.getLiquidityMint(),
    signer,
    new VanillaObligation(market.programId),
    true,
    {
      scope,
      scopeConfigurations: await scope.getAllConfigurations(),
    },
  );

  const signature = await sendAndConfirmTx(pool, signer, KaminoAction.actionToIxs(kaminoAction));
  return {
    protocol: 'kamino',
    asset: opportunity.asset,
    amount,
    apy: opportunity.apy,
    marketAddress: opportunity.marketAddress,
    reserveAddress: opportunity.reserveAddress,
    signature: String(signature),
  };
}

async function withdrawWithKamino(
  keypair: Keypair,
  rpcUrl: string,
  opportunity: LendingRate,
  amount: number,
  dryRun = false,
): Promise<LendingActionResult> {
  if (dryRun) {
    return {
      protocol: 'kamino',
      asset: opportunity.asset,
      amount,
      apy: opportunity.apy,
      marketAddress: opportunity.marketAddress,
      reserveAddress: opportunity.reserveAddress,
      signature: 'dry-run',
    };
  }

  const { pool, market, reserve, signer, scope } = await buildKaminoContext(rpcUrl, opportunity, keypair);
  const amountRaw = new BN(parseUiAmountToRaw(amount, opportunity.decimals));
  const kaminoAction = await KaminoAction.buildWithdrawTxns(
    market,
    amountRaw,
    reserve.getLiquidityMint(),
    signer,
    new VanillaObligation(market.programId),
    true,
    {
      scope,
      scopeConfigurations: await scope.getAllConfigurations(),
    },
  );

  const signature = await sendAndConfirmTx(pool, signer, KaminoAction.actionToIxs(kaminoAction));
  return {
    protocol: 'kamino',
    asset: opportunity.asset,
    amount,
    apy: opportunity.apy,
    marketAddress: opportunity.marketAddress,
    reserveAddress: opportunity.reserveAddress,
    signature: String(signature),
  };
}

async function repayWithKamino(
  keypair: Keypair,
  rpcUrl: string,
  opportunity: LendingRate,
  amount: number,
  dryRun = false,
): Promise<LendingActionResult> {
  if (dryRun) {
    return {
      protocol: 'kamino',
      asset: opportunity.asset,
      amount,
      apy: opportunity.apy,
      marketAddress: opportunity.marketAddress,
      reserveAddress: opportunity.reserveAddress,
      signature: 'dry-run',
    };
  }

  const { pool, market, reserve, signer, scope } = await buildKaminoContext(rpcUrl, opportunity, keypair);
  const currentSlot = await pool.rpc.getSlot({ commitment: 'confirmed' }).send();
  const amountRaw = new BN(parseUiAmountToRaw(amount, opportunity.decimals));
  const kaminoAction = await KaminoAction.buildRepayTxns(
    market,
    amountRaw,
    reserve.getLiquidityMint(),
    signer,
    new VanillaObligation(market.programId),
    true,
    {
      scope,
      scopeConfigurations: await scope.getAllConfigurations(),
    },
    currentSlot,
  );

  const signature = await sendAndConfirmTx(pool, signer, KaminoAction.actionToIxs(kaminoAction));
  return {
    protocol: 'kamino',
    asset: opportunity.asset,
    amount,
    apy: opportunity.apy,
    marketAddress: opportunity.marketAddress,
    reserveAddress: opportunity.reserveAddress,
    signature: String(signature),
  };
}

function symbolsLastIndex<T>(values: T[]): number {
  return values.length - 1;
}

export async function lend(
  options: LendOptions & { rpcUrl: string },
  connection: Connection,
  keypair: Keypair,
): Promise<LendResult> {
  const rates = await getLendingRates(
    {
      asset: options.asset,
      protocol: options.protocol,
      rpcUrl: options.rpcUrl,
    },
    connection,
  );
  const best = pickBestLendingRate(rates, options.protocol);

  if (best.protocol === 'marginfi') {
    return lendWithMarginfi(connection, options.rpcUrl, keypair, best, options.amount, options.dryRun);
  }

  return lendWithKamino(keypair, options.rpcUrl, best, options.amount, options.dryRun);
}

export async function borrow(
  options: BorrowOptions & { rpcUrl: string },
  connection: Connection,
  keypair: Keypair,
): Promise<LendingActionResult> {
  const rates = await getLendingRates(
    {
      asset: options.asset,
      protocol: options.protocol,
      rpcUrl: options.rpcUrl,
    },
    connection,
  );
  const target = resolveOpportunity(rates, options);
  return target.protocol === 'marginfi'
    ? borrowWithMarginfi(connection, options.rpcUrl, keypair, target, options.amount, options.dryRun)
    : borrowWithKamino(keypair, options.rpcUrl, target, options.amount, options.dryRun);
}

export async function withdraw(
  options: WithdrawOptions & { rpcUrl: string },
  connection: Connection,
  keypair: Keypair,
): Promise<LendingActionResult> {
  const rates = await getLendingRates(
    {
      asset: options.asset,
      protocol: options.protocol,
      rpcUrl: options.rpcUrl,
    },
    connection,
  );
  const target = resolveOpportunity(rates, options);
  return target.protocol === 'marginfi'
    ? withdrawWithMarginfi(connection, options.rpcUrl, keypair, target, options.amount, options.withdrawAll, options.dryRun)
    : withdrawWithKamino(keypair, options.rpcUrl, target, options.amount, options.dryRun);
}

export async function repay(
  options: RepayOptions & { rpcUrl: string },
  connection: Connection,
  keypair: Keypair,
): Promise<LendingActionResult> {
  const rates = await getLendingRates(
    {
      asset: options.asset,
      protocol: options.protocol,
      rpcUrl: options.rpcUrl,
    },
    connection,
  );
  const target = resolveOpportunity(rates, options);
  return target.protocol === 'marginfi'
    ? repayWithMarginfi(connection, options.rpcUrl, keypair, target, options.amount, options.repayAll, options.dryRun)
    : repayWithKamino(keypair, options.rpcUrl, target, options.amount, options.dryRun);
}

export async function rebalance(
  options: RebalanceOptions & { rpcUrl: string },
  connection: Connection,
  keypair: Keypair,
): Promise<RebalanceResult> {
  const rates = await getLendingRates(
    {
      asset: options.asset,
      protocol: 'auto',
      rpcUrl: options.rpcUrl,
    },
    connection,
  );

  const from = resolveOpportunity(rates, options);
  const to = pickRebalanceTarget(rates, from, options.targetProtocol ?? 'auto');
  if (!to) {
    return {
      status: 'skipped',
      asset: options.asset,
      amount: options.amount,
      from,
      to: from,
      apyDelta: 0,
      reason: 'No alternative lending venue found for this asset.',
    };
  }

  const apyDelta = to.apy - from.apy;
  if (apyDelta <= (options.minApyDelta ?? 0)) {
    return {
      status: 'skipped',
      asset: options.asset,
      amount: options.amount,
      from,
      to,
      apyDelta,
      reason: `Current venue is already within the requested APY delta threshold (${options.minApyDelta ?? 0}).`,
    };
  }

  if (options.dryRun) {
    return {
      status: 'rebalanced',
      asset: options.asset,
      amount: options.amount,
      from,
      to,
      apyDelta,
      withdrawSignature: 'dry-run',
      lendSignature: 'dry-run',
    };
  }

  const withdrawResult = from.protocol === 'marginfi'
    ? await withdrawWithMarginfi(connection, options.rpcUrl, keypair, from, options.amount, false, false)
    : await withdrawWithKamino(keypair, options.rpcUrl, from, options.amount, false);

  const lendResult = to.protocol === 'marginfi'
    ? await lendWithMarginfi(connection, options.rpcUrl, keypair, to, options.amount, false)
    : await lendWithKamino(keypair, options.rpcUrl, to, options.amount, false);

  return {
    status: 'rebalanced',
    asset: options.asset,
    amount: options.amount,
    from,
    to,
    apyDelta,
    withdrawSignature: withdrawResult.signature,
    lendSignature: lendResult.signature,
  };
}
