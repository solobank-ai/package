export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
export const SOL_DECIMALS = 9;
export const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD6jH4vM9kP7LkGEXUXMaLL';
export const USDT_DECIMALS = 6;
export const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
export const JUP_DECIMALS = 6;

export interface KnownAsset {
  symbol: string;
  mint: string;
  decimals: number;
}

export const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export function getUsdcMint(): string {
  const rpc = process.env.SOLOBANK_RPC_URL ?? '';
  return rpc.includes('devnet') ? DEVNET_USDC_MINT : MAINNET_USDC_MINT;
}

export const KNOWN_ASSETS: Record<string, KnownAsset> = {
  SOL: { symbol: 'SOL', mint: WRAPPED_SOL_MINT, decimals: SOL_DECIMALS },
  get USDC() { return { symbol: 'USDC', mint: getUsdcMint(), decimals: 6 }; },
  USDT: { symbol: 'USDT', mint: USDT_MINT, decimals: USDT_DECIMALS },
  JUP: { symbol: 'JUP', mint: JUP_MINT, decimals: JUP_DECIMALS },
};

export interface ResolvedAsset extends KnownAsset {
  input: string;
  isKnown: boolean;
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isLikelyMint(value: string): boolean {
  return BASE58_RE.test(value);
}

export function resolveAsset(input: string): ResolvedAsset {
  const normalized = input.trim();
  const upper = normalized.toUpperCase();
  const known = KNOWN_ASSETS[upper];

  if (known) {
    return {
      ...known,
      input: normalized,
      isKnown: true,
    };
  }

  if (isLikelyMint(normalized)) {
    return {
      symbol: normalized,
      mint: normalized,
      decimals: 6,
      input: normalized,
      isKnown: false,
    };
  }

  throw new Error(`Unsupported asset "${input}". Use a known symbol like SOL/USDC/USDT/JUP or a token mint.`);
}

export function formatPercent(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}
