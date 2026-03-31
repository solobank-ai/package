import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PaymentLogEntry {
  service: string;
  endpoint: string;
  amount: string;
  reference: string | null;
  createdAt: string;
}

export interface PaymentStats {
  count: number;
  totalAmount: number;
  byService: Array<{
    service: string;
    count: number;
    totalAmount: number;
  }>;
}

const defaultLogFile = path.join('/tmp', 'solobank-gateway', 'mpp-payments.jsonl');
const defaultReplayFile = path.join('/tmp', 'solobank-gateway', 'mpp-references.jsonl');

function getLogFilePath() {
  return process.env.SOLOBANK_GATEWAY_LOG_FILE ?? defaultLogFile;
}

function getReplayFilePath() {
  return process.env.SOLOBANK_GATEWAY_REPLAY_FILE ?? defaultReplayFile;
}

async function ensureLogDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function logPayment(entry: Omit<PaymentLogEntry, 'createdAt'>) {
  const filePath = getLogFilePath();
  const payload: PaymentLogEntry = {
    ...entry,
    createdAt: new Date().toISOString(),
  };

  try {
    await ensureLogDir(filePath);
    await appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // Fire-and-forget only. Payment flow must not fail because logging did.
  }
}

export async function hasConsumedReference(reference: string): Promise<boolean> {
  const filePath = getReplayFilePath();

  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .some((line) => {
        const parsed = JSON.parse(line) as { reference?: string };
        return parsed.reference === reference;
      });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT')) {
      return false;
    }

    throw error;
  }
}

export async function markReferenceConsumed(reference: string) {
  const filePath = getReplayFilePath();

  try {
    await ensureLogDir(filePath);
    await appendFile(
      filePath,
      `${JSON.stringify({ reference, consumedAt: new Date().toISOString() })}\n`,
      'utf8',
    );
  } catch {
    throw new Error('Could not persist consumed payment reference');
  }
}

export async function readPayments(): Promise<PaymentLogEntry[]> {
  const filePath = getLogFilePath();

  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as PaymentLogEntry)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ENOENT')) {
      return [];
    }

    throw error;
  }
}

export function summarizePayments(entries: PaymentLogEntry[]): PaymentStats {
  const byService = new Map<string, { count: number; totalAmount: number }>();
  let totalAmount = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount);
    totalAmount += Number.isFinite(amount) ? amount : 0;

    const current = byService.get(entry.service) ?? { count: 0, totalAmount: 0 };
    current.count += 1;
    current.totalAmount += Number.isFinite(amount) ? amount : 0;
    byService.set(entry.service, current);
  }

  return {
    count: entries.length,
    totalAmount,
    byService: Array.from(byService.entries())
      .map(([service, stats]) => ({
        service,
        count: stats.count,
        totalAmount: Number(stats.totalAmount.toFixed(6)),
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount),
  };
}
