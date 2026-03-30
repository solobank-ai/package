import { NextResponse } from 'next/server';
import { readPayments } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50;
  const payments = await readPayments();

  return NextResponse.json(payments.slice(0, safeLimit), {
    headers: {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}
