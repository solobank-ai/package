/**
 * Types for AI Decision Vault smart contract interaction
 */

export const VAULT_PROGRAM_ID = 'SBVauLTnmDR53sBxfBweABpVsRqEH9FHbsHhPi2Jz4F'; // Will be updated after deploy

export type DecisionType = 'lend' | 'swap' | 'rebalance' | 'withdraw';

export const DECISION_TYPE_MAP: Record<DecisionType, number> = {
  lend: 1,
  swap: 2,
  rebalance: 3,
  withdraw: 4,
};

export type DecisionStatus = 'pending' | 'executed' | 'rejected';

export interface VaultState {
  owner: string;
  balance: bigint;
  maxPerTx: bigint;
  dailyLimit: bigint;
  totalDecisions: bigint;
  totalVolume: bigint;
  dailySpent: bigint;
  lastResetDay: bigint;
  isLocked: boolean;
}

export interface AiDecisionRecord {
  vault: string;
  agent: string;
  decisionType: DecisionType;
  asset: string;
  amount: bigint;
  reasoningHash: Uint8Array;
  status: DecisionStatus;
  timestamp: bigint;
}

export interface AiAnalysis {
  action: DecisionType | 'hold';
  asset: string;
  amount: number;
  protocol?: string;
  reasoning: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface VaultInitOptions {
  maxPerTx: number;
  dailyLimit: number;
}

export interface VaultDecideOptions {
  decisionType: DecisionType;
  asset: string;
  amount: number;
  reasoning: string;
}
