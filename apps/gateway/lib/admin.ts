import { gatewayAdminToken } from '@/lib/constants';

function parseAuthorization(header: string | null) {
  if (!header) {
    return null;
  }

  const [scheme, value] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }

  return value;
}

export function ensureAdminAccess(request: Request): Response | null {
  if (!gatewayAdminToken) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const bearer = parseAuthorization(request.headers.get('authorization'));
  const direct = request.headers.get('x-solobank-admin-token');
  const provided = bearer ?? direct;

  if (provided !== gatewayAdminToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
