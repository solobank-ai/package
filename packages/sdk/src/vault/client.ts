/**
 * Vault Client — TypeScript interface to the AI Decision Vault smart contract.
 *
 * Provides methods to initialize, deposit, record AI decisions, execute,
 * withdraw, and lock/unlock the vault.
 *
 * In production, these call the deployed Anchor program on Solana.
 * Pre-deploy, they simulate locally for testing.
 */

import { createHash } from 'node:crypto';
import type {
  VaultState,
  AiDecisionRecord,
  AiAnalysis,
  VaultInitOptions,
  VaultDecideOptions,
  DecisionType,
} from './types.js';
import { VAULT_PROGRAM_ID, DECISION_TYPE_MAP } from './types.js';

export interface VaultClientOptions {
  rpcUrl: string;
  programId?: string;
  openaiApiKey?: string;
}

/**
 * Hash reasoning text to 32 bytes (SHA-256) for on-chain storage.
 */
export function hashReasoning(reasoning: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(reasoning).digest());
}

/**
 * AI analysis using OpenAI GPT-4o-mini.
 * Returns a structured decision based on current DeFi rates.
 */
export async function analyzeWithAi(
  rates: Array<{ protocol: string; asset: string; apy: number; market: string }>,
  balance: number,
  positions: string[],
  openaiApiKey: string,
): Promise<AiAnalysis> {
  const systemPrompt = `You are Solobank AI — an autonomous DeFi investment agent on Solana.
Analyze lending rates and portfolio to make optimal decisions.

Respond with JSON only:
{
  "action": "lend" | "swap" | "rebalance" | "withdraw" | "hold",
  "asset": "USDC" | "SOL",
  "amount": <number>,
  "protocol": "kamino" | "marginfi" | null,
  "reasoning": "<1-2 sentences>",
  "confidence": <0-100>,
  "riskLevel": "low" | "medium" | "high"
}

Rules:
- Prefer higher APY when risk is similar
- If APY difference < 0.5%, recommend "hold"
- Never recommend more than available balance
- confidence < 70 means "hold"`;

  const userPrompt = `Rates:\n${rates.map((r) => `- ${r.protocol} ${r.asset}: ${r.apy.toFixed(2)}% APY (${r.market})`).join('\n')}\n\nBalance: $${balance.toFixed(2)} USDC\nPositions: ${positions.length > 0 ? positions.join(', ') : 'none'}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return JSON.parse(data.choices[0].message.content) as AiAnalysis;
}

/**
 * Vault client for interacting with the on-chain AI Decision Vault.
 *
 * Pre-deploy: simulates vault state locally.
 * Post-deploy: sends real transactions to the Anchor program.
 */
export class VaultClient {
  private rpcUrl: string;
  private programId: string;
  private openaiApiKey?: string;

  // Local simulation state (used before contract is deployed)
  private simState: VaultState | null = null;
  private simDecisions: AiDecisionRecord[] = [];

  constructor(options: VaultClientOptions) {
    this.rpcUrl = options.rpcUrl;
    this.programId = options.programId ?? VAULT_PROGRAM_ID;
    this.openaiApiKey = options.openaiApiKey;
  }

  /**
   * Initialize a new vault with safeguard limits.
   */
  async initialize(owner: string, options: VaultInitOptions): Promise<{ vault: string }> {
    this.simState = {
      owner,
      balance: 0n,
      maxPerTx: BigInt(Math.round(options.maxPerTx * 1e6)),
      dailyLimit: BigInt(Math.round(options.dailyLimit * 1e6)),
      totalDecisions: 0n,
      totalVolume: 0n,
      dailySpent: 0n,
      lastResetDay: BigInt(Math.floor(Date.now() / 1000 / 86400)),
      isLocked: false,
    };

    return { vault: `vault_${owner.slice(0, 8)}` };
  }

  /**
   * Deposit funds into the vault.
   */
  async deposit(amount: number): Promise<{ balance: number }> {
    if (!this.simState) throw new Error('Vault not initialized');

    const raw = BigInt(Math.round(amount * 1e6));
    this.simState.balance += raw;

    return { balance: Number(this.simState.balance) / 1e6 };
  }

  /**
   * AI analyzes market and records decision on-chain.
   */
  async aiDecide(options: VaultDecideOptions): Promise<{
    decision: AiAnalysis | null;
    decisionId: string;
    reasoningHash: string;
  }> {
    if (!this.simState) throw new Error('Vault not initialized');
    if (this.simState.isLocked) throw new Error('Vault is locked');

    const amountRaw = BigInt(Math.round(options.amount * 1e6));
    if (amountRaw > this.simState.maxPerTx) {
      throw new Error(`Amount exceeds per-tx limit of ${Number(this.simState.maxPerTx) / 1e6}`);
    }
    if (amountRaw > this.simState.balance) {
      throw new Error('Insufficient vault balance');
    }

    const hash = hashReasoning(options.reasoning);
    const hashHex = Buffer.from(hash).toString('hex');

    const record: AiDecisionRecord = {
      vault: 'sim',
      agent: this.simState.owner,
      decisionType: options.decisionType,
      asset: options.asset,
      amount: amountRaw,
      reasoningHash: hash,
      status: 'pending',
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    };

    this.simDecisions.push(record);
    this.simState.totalDecisions += 1n;
    this.simState.dailySpent += amountRaw;

    const decisionId = `decision_${this.simState.totalDecisions}`;

    return { decision: null, decisionId, reasoningHash: hashHex };
  }

  /**
   * Run full AI analysis + record decision.
   */
  async analyzeAndDecide(
    rates: Array<{ protocol: string; asset: string; apy: number; market: string }>,
    balance: number,
    positions: string[],
  ): Promise<{
    analysis: AiAnalysis;
    decisionId: string | null;
    reasoningHash: string | null;
  }> {
    if (!this.openaiApiKey) throw new Error('OpenAI API key not configured');

    const analysis = await analyzeWithAi(rates, balance, positions, this.openaiApiKey);

    if (analysis.action === 'hold' || analysis.confidence < 70) {
      return { analysis, decisionId: null, reasoningHash: null };
    }

    const { decisionId, reasoningHash } = await this.aiDecide({
      decisionType: analysis.action as DecisionType,
      asset: analysis.asset,
      amount: analysis.amount,
      reasoning: analysis.reasoning,
    });

    return { analysis, decisionId, reasoningHash };
  }

  /**
   * Execute a pending decision.
   */
  async executeDecision(decisionId: string): Promise<{ executed: boolean }> {
    if (!this.simState) throw new Error('Vault not initialized');

    const idx = this.simDecisions.findIndex(
      (_, i) => `decision_${i + 1}` === decisionId && _.status === 'pending',
    );

    if (idx === -1) throw new Error('Decision not found or not pending');

    const decision = this.simDecisions[idx];
    decision.status = 'executed';
    this.simState.balance -= decision.amount;
    this.simState.totalVolume += decision.amount;

    return { executed: true };
  }

  /**
   * Withdraw funds from the vault.
   */
  async withdraw(amount: number): Promise<{ balance: number }> {
    if (!this.simState) throw new Error('Vault not initialized');

    const raw = BigInt(Math.round(amount * 1e6));
    if (raw > this.simState.balance) throw new Error('Insufficient balance');

    this.simState.balance -= raw;
    return { balance: Number(this.simState.balance) / 1e6 };
  }

  /**
   * Get vault state.
   */
  async getState(): Promise<VaultState | null> {
    return this.simState;
  }

  /**
   * Get all decisions.
   */
  async getDecisions(): Promise<AiDecisionRecord[]> {
    return this.simDecisions;
  }

  /**
   * Lock the vault.
   */
  async lock(): Promise<void> {
    if (!this.simState) throw new Error('Vault not initialized');
    this.simState.isLocked = true;
  }

  /**
   * Unlock the vault.
   */
  async unlock(): Promise<void> {
    if (!this.simState) throw new Error('Vault not initialized');
    this.simState.isLocked = false;
  }
}
