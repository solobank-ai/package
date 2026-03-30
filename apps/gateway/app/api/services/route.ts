import { NextResponse } from 'next/server';
import { gatewayBaseUrl } from '@/lib/constants';
import { buildServices } from '@/lib/routes';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(buildServices(gatewayBaseUrl), {
    headers: {
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
}
