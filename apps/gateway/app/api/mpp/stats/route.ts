import { NextResponse } from 'next/server';
import { readPayments, summarizePayments } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const payments = await readPayments();
  const stats = summarizePayments(payments);

  return NextResponse.json(stats, {
    headers: {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}
