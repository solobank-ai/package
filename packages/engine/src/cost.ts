/**
 * Cost tracker for LLM token usage.
 */

import type { ProviderUsage } from './provider.js';

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-4o': { input: 2.50 / 1_000_000, output: 10.0 / 1_000_000 },
};

export class CostTracker {
  private totalCost = 0;
  private totalTokens = { input: 0, output: 0 };

  track(model: string, usage: ProviderUsage): number {
    const pricing = PRICING[model] ?? PRICING['gpt-4o-mini'];
    const cost = usage.promptTokens * pricing.input + usage.completionTokens * pricing.output;
    this.totalCost += cost;
    this.totalTokens.input += usage.promptTokens;
    this.totalTokens.output += usage.completionTokens;
    return cost;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  getTotalTokens(): { input: number; output: number } {
    return { ...this.totalTokens };
  }
}
