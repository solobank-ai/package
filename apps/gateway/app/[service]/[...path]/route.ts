import { NextResponse } from 'next/server';
import { chargeProxy } from '@/lib/gateway';
import { resolveGatewayRoute } from '@/lib/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ service: string; path: string[] }> },
) {
  const params = await context.params;
  const routePath = `/${[params.service, ...params.path].join('/')}`;
  const definition = resolveGatewayRoute(routePath);

  if (!definition) {
    return NextResponse.json(
      { error: `Unknown Solobank gateway route: ${routePath}` },
      { status: 404 },
    );
  }

  const handler = chargeProxy(
    definition.price,
    definition.resolveUpstream(definition.params),
    definition.resolveHeaders?.(definition.params) ?? {},
    {
      upstreamMethod: definition.upstreamMethod,
      bodyToQuery: definition.bodyToQuery,
    },
  );

  return handler(request);
}
