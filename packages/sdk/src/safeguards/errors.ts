export type SafeguardRule = 'locked' | 'maxPerTx' | 'maxDailySend';

export interface SafeguardErrorDetails {
  attempted?: number;
  limit?: number;
  current?: number;
}

export class SafeguardError extends Error {
  readonly rule: SafeguardRule;
  readonly details: SafeguardErrorDetails;

  constructor(rule: SafeguardRule, details: SafeguardErrorDetails, message?: string) {
    super(message ?? buildMessage(rule, details));
    this.name = 'SafeguardError';
    this.rule = rule;
    this.details = details;
  }

  toJSON() {
    return {
      error: 'SAFEGUARD_BLOCKED' as const,
      message: this.message,
      data: { rule: this.rule, ...this.details },
    };
  }
}

function buildMessage(rule: SafeguardRule, details: SafeguardErrorDetails): string {
  switch (rule) {
    case 'locked':
      return 'Agent is locked. All operations are frozen.';
    case 'maxPerTx':
      return `Amount $${(details.attempted ?? 0).toFixed(2)} exceeds per-transaction limit ($${(details.limit ?? 0).toFixed(2)})`;
    case 'maxDailySend':
      return `Daily send limit reached ($${(details.current ?? 0).toFixed(2)}/$${(details.limit ?? 0).toFixed(2)} used today)`;
  }
}
