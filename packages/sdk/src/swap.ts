import { VersionedTransaction } from '@solana/web3.js';
import { resolveAsset } from './assets.js';

export type JupiterSwapMode = 'ExactIn' | 'ExactOut';

export interface SwapQuoteOptions {
  fromAsset: string;
  toAsset: string;
  amount: number;
  slippageBps?: number;
  swapMode?: JupiterSwapMode;
  onlyDirectRoutes?: boolean;
}

export interface SwapQuoteResult {
  fromAsset: string;
  toAsset: string;
  inputMint: string;
  outputMint: string;
  inputSymbol: string;
  outputSymbol: string;
  inAmountRaw: string;
  outAmountRaw: string;
  inAmount: number;
  outAmount: number;
  otherAmountThreshold: string;
  priceImpactPct: number;
  routeLabels: string[];
  slippageBps: number;
  rawQuote: JupiterQuoteResponse;
}

export interface SwapExecutionResult extends SwapQuoteResult {
  signature: string;
  explorerUrl: string;
}

interface JupiterRoutePlanStep {
  swapInfo?: {
    label?: string;
  };
}

interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: JupiterSwapMode;
  slippageBps: number;
  priceImpactPct: string;
  routePlan?: JupiterRoutePlanStep[];
}

interface JupiterSwapResponse {
  swapTransaction: string;
}

function getJupiterBaseUrl(): string {
  return process.env.SOLOBANK_JUP_BASE_URL ?? 'https://lite-api.jup.ag';
}

function getJupiterHeaders(): Record<string, string> {
  const apiKey = process.env.SOLOBANK_JUP_API_KEY;
  if (!apiKey) {
    return {};
  }

  return {
    'x-api-key': apiKey,
  };
}

function parseRawAmount(raw: string, decimals: number): number {
  if (!Number.isFinite(decimals) || decimals < 0) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }

  const normalized = raw.padStart(decimals + 1, '0');
  const whole = normalized.slice(0, normalized.length - decimals);
  const frac = decimals === 0 ? '' : normalized.slice(-decimals);
  return Number(`${whole}${frac ? `.${frac}` : ''}`);
}

function parseInputAmountToRaw(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Swap amount must be a positive number. Received ${amount}`);
  }

  const scale = 10 ** decimals;
  return String(Math.round(amount * scale));
}

function buildExplorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

export async function getSwapQuote(options: SwapQuoteOptions): Promise<SwapQuoteResult> {
  const from = resolveAsset(options.fromAsset);
  const to = resolveAsset(options.toAsset);
  const slippageBps = options.slippageBps ?? 50;
  const swapMode = options.swapMode ?? 'ExactIn';
  const amountRaw = parseInputAmountToRaw(options.amount, from.decimals);

  const url = new URL('/swap/v1/quote', getJupiterBaseUrl());
  url.searchParams.set('inputMint', from.mint);
  url.searchParams.set('outputMint', to.mint);
  url.searchParams.set('amount', amountRaw);
  url.searchParams.set('slippageBps', String(slippageBps));
  url.searchParams.set('swapMode', swapMode);
  url.searchParams.set('restrictIntermediateTokens', 'true');
  if (options.onlyDirectRoutes) {
    url.searchParams.set('onlyDirectRoutes', 'true');
  }

  const response = await fetch(url, {
    headers: getJupiterHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Jupiter quote request failed with ${response.status} ${response.statusText}`);
  }

  const quote = await response.json() as JupiterQuoteResponse;
  return {
    fromAsset: options.fromAsset,
    toAsset: options.toAsset,
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    inputSymbol: from.symbol,
    outputSymbol: to.symbol,
    inAmountRaw: quote.inAmount,
    outAmountRaw: quote.outAmount,
    inAmount: parseRawAmount(quote.inAmount, from.decimals),
    outAmount: parseRawAmount(quote.outAmount, to.decimals),
    otherAmountThreshold: quote.otherAmountThreshold,
    priceImpactPct: Number(quote.priceImpactPct),
    routeLabels: (quote.routePlan ?? [])
      .map((step) => step.swapInfo?.label)
      .filter((label): label is string => Boolean(label)),
    slippageBps: quote.slippageBps,
    rawQuote: quote,
  };
}

export async function getSwapTransaction(
  quote: SwapQuoteResult,
  userPublicKey: string,
): Promise<VersionedTransaction> {
  const response = await fetch(new URL('/swap/v1/swap', getJupiterBaseUrl()), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getJupiterHeaders(),
    },
    body: JSON.stringify({
      quoteResponse: quote.rawQuote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Jupiter swap transaction request failed with ${response.status} ${response.statusText}`);
  }

  const body = await response.json() as JupiterSwapResponse;
  if (!body.swapTransaction) {
    throw new Error('Jupiter swap response did not include a swapTransaction');
  }

  const serialized = Buffer.from(body.swapTransaction, 'base64');
  return VersionedTransaction.deserialize(serialized);
}

export function toSwapExecutionResult(
  quote: SwapQuoteResult,
  signature: string,
): SwapExecutionResult {
  return {
    ...quote,
    signature,
    explorerUrl: buildExplorerUrl(signature),
  };
}
