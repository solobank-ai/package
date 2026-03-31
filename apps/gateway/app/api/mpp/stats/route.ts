import { NextResponse } from 'next/server';
import { ensureAdminAccess } from '@/lib/admin';
import { readPayments, summarizePayments } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const accessError = ensureAdminAccess(request);
  if (accessError) {
    return accessError;
  }

  const payments = await readPayments();
  const stats = summarizePayments(payments);

  return NextResponse.json(stats, {
    headers: {
      'cache-control': 'no-store',
    },
  });
}
