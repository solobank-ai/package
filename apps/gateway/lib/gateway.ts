import { Mppx } from 'mppx/nextjs';
import { SOLANA_USDC_MINT, solanaServer } from 'solobank';
import { gatewayCurrency, gatewayRecipient, gatewayRpcUrl } from '@/lib/constants';
import { logPayment } from '@/lib/payments';
import { parseReceiptReference } from '@/lib/receipt';

type RouteHandler = (request: Request) => Promise<Response> | Response;

interface ProxyOptions {
  upstreamMethod?: 'GET' | 'POST';
  bodyToQuery?: boolean;
  validate?: (body: Record<string, unknown>) => string | null;
}

function createGateway() {
  return Mppx.create({
    methods: [
      solanaServer({
        currency: gatewayCurrency || SOLANA_USDC_MINT,
        recipient: gatewayRecipient,
        rpcUrl: gatewayRpcUrl,
      }),
    ],
  });
}

let gateway: ReturnType<typeof createGateway> | undefined;

function getGateway() {
  if (!gateway) {
    gateway = createGateway();
  }

  return gateway;
}

function cleanHeaders(input: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export function inferServiceEndpoint(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return {
      service: parts[0] ?? 'unknown',
      endpoint: `/${parts.slice(1).join('/') || ''}`.replace(/\/$/, '') || '/',
    };
  } catch {
    return { service: 'unknown', endpoint: '/' };
  }
}

function cloneUpstreamResponse(response: Response) {
  const headers = new Headers(response.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

/**
 * Fixed-price proxy. Each request costs the same amount.
 */
export function chargeProxy(
  amount: string,
  upstream: string,
  upstreamHeaders: Record<string, string | undefined>,
  options?: ProxyOptions,
): RouteHandler {
  return async (req: Request) => {
    const mppx = getGateway();
    const bodyText = await req.text();
    const method = options?.upstreamMethod ?? 'POST';

    if (options?.validate && bodyText) {
      try {
        const parsed = JSON.parse(bodyText) as Record<string, unknown>;
        const validationError = options.validate(parsed);
        if (validationError) {
          return Response.json({ error: validationError }, { status: 400 });
        }
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }

    const handler: RouteHandler = async () => {
      let url = upstream;

      if (options?.bodyToQuery && bodyText) {
        const query = new URLSearchParams(
          JSON.parse(bodyText) as Record<string, string>,
        ).toString();
        url = query ? `${upstream}${upstream.includes('?') ? '&' : '?'}${query}` : upstream;
      }

      const response = await fetch(url, {
        method,
        headers: cleanHeaders({
          ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
          ...upstreamHeaders,
        }),
        body: method === 'POST' && bodyText ? bodyText : undefined,
      });

      return cloneUpstreamResponse(response);
    };

    const response = await mppx.charge({ amount })(handler)(
      new Request(req.url, { method: req.method, headers: req.headers }),
    );

    if (response.status !== 402) {
      const { service, endpoint } = inferServiceEndpoint(req.url);
      const receipt = parseReceiptReference(response.headers.get('Payment-Receipt'));
      void logPayment({ service, endpoint, amount, reference: receipt });
    }

    return response;
  };
}

/**
 * Dynamic-price proxy. The amount is resolved from request body.
 */
export function chargeCustom(
  amount: string | ((body: string) => string | Promise<string>),
  handler: (body: string) => Promise<Response>,
): RouteHandler {
  return async (req: Request) => {
    const mppx = getGateway();
    const bodyText = await req.text();

    let resolvedAmount: string;
    try {
      resolvedAmount = typeof amount === 'function' ? await amount(bodyText) : amount;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid request';
      return Response.json({ error: message }, { status: 400 });
    }

    const response = await mppx.charge({ amount: resolvedAmount })(() => handler(bodyText))(
      new Request(req.url, { method: req.method, headers: req.headers }),
    );

    if (response.status !== 402) {
      const { service, endpoint } = inferServiceEndpoint(req.url);
      const receipt = parseReceiptReference(response.headers.get('Payment-Receipt'));
      void logPayment({ service, endpoint, amount: resolvedAmount, reference: receipt });
    }

    return response;
  };
}

/**
 * Fetch with retries to avoid losing a paid request because an upstream 5xx was transient.
 */
export async function fetchWithRetry(url: string, init: RequestInit, retries = 3) {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.status < 500 || attempt === retries - 1) {
        return cloneUpstreamResponse(response);
      }
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === retries - 1) {
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }

  return Response.json(
    {
      error: 'Upstream service unavailable after retries',
      detail: lastError,
    },
    { status: 502 },
  );
}
