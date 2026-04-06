export interface SafeguardConfig {
  locked: boolean;
  maxPerTx: number;
  maxDailySend: number;
  dailyUsed: number;
  dailyResetDate: string;
}

export interface TxMetadata {
  operation:
    | 'send'
    | 'pay'
    | 'swap'
    | 'lend'
    | 'borrow'
    | 'withdraw'
    | 'repay';
  amount?: number;
}

export const OUTBOUND_OPS = new Set<TxMetadata['operation']>([
  'send',
  'pay',
]);

export const DEFAULT_SAFEGUARD_CONFIG: SafeguardConfig = {
  locked: false,
  maxPerTx: 0,
  maxDailySend: 0,
  dailyUsed: 0,
  dailyResetDate: '',
};
