import { address, type Address } from '@solana/kit';

export const SOLANA_USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const USDC_DECIMALS = 6;

export interface TokenAccountInfo {
  address: Address;
  amount: bigint;
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

/** Minimal RPC interface for token account queries (testable / mockable). */
export interface TokenAccountRpc {
  getTokenAccountsByOwner(
    owner: Address,
    filter: { mint: Address },
    config: { encoding: 'jsonParsed' },
  ): { send(): Promise<{ value: ReadonlyArray<{ pubkey: Address; account: { data: unknown } }> }> };
}

export async function fetchTokenAccounts(
  rpc: TokenAccountRpc,
  owner: Address,
  mint: Address,
): Promise<TokenAccountInfo[]> {
  const response = await rpc.getTokenAccountsByOwner(
    owner,
    { mint },
    { encoding: 'jsonParsed' },
  ).send();

  return response.value
    .map(({ pubkey, account }) => {
      const data = account.data;
      if (typeof data !== 'object' || data === null || !('parsed' in data)) {
        return null;
      }

      const parsed = data as { parsed: { info?: { tokenAmount?: { amount?: string } } } };
      const amount = parsed.parsed.info?.tokenAmount?.amount;
      if (typeof amount !== 'string') {
        return null;
      }

      return {
        address: pubkey,
        amount: BigInt(amount),
      };
    })
    .filter((account): account is TokenAccountInfo => account !== null && account.amount > 0n)
    .sort((left, right) => (left.amount === right.amount ? 0 : left.amount > right.amount ? -1 : 1));
}

export function buildTransferPlan(
  accounts: TokenAccountInfo[],
  requestedRaw: bigint,
): Array<{ address: Address; amount: bigint }> {
  let remaining = requestedRaw;
  const plan: Array<{ address: Address; amount: bigint }> = [];

  for (const account of accounts) {
    if (remaining <= 0n) {
      break;
    }

    const amount = account.amount < remaining ? account.amount : remaining;
    if (amount <= 0n) {
      continue;
    }

    plan.push({ address: account.address, amount });
    remaining -= amount;
  }

  if (remaining > 0n) {
    throw new Error('Insufficient token balance to complete transfer plan');
  }

  return plan;
}

export function sumReceivedTokenAmount(
  preBalances: TokenBalance[] | null | undefined,
  postBalances: TokenBalance[] | null | undefined,
  mint: string,
  owner: string,
): bigint {
  const relevantPre = new Map<number, bigint>();

  for (const balance of preBalances ?? []) {
    if (balance.mint === mint && balance.owner === owner) {
      relevantPre.set(balance.accountIndex, BigInt(balance.uiTokenAmount.amount));
    }
  }

  let received = 0n;
  for (const balance of postBalances ?? []) {
    if (balance.mint !== mint || balance.owner !== owner) {
      continue;
    }

    const before = relevantPre.get(balance.accountIndex) ?? 0n;
    const after = BigInt(balance.uiTokenAmount.amount);
    const delta = after - before;
    if (delta > 0n) {
      received += delta;
    }
  }

  return received;
}

export function parseAmountToRaw(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFrac);
}
