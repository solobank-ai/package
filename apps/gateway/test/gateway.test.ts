import { describe, expect, it } from 'vitest';
import { inferServiceEndpoint } from '@/lib/gateway';
import { summarizePayments, type PaymentLogEntry } from '@/lib/payments';
import { buildServices, resolveGatewayRoute } from '@/lib/routes';

describe('gateway helpers', () => {
  it('infers service and endpoint from the route URL', () => {
    expect(
      inferServiceEndpoint('https://gateway.example/openai/v1/chat/completions'),
    ).toEqual({
      service: 'openai',
      endpoint: '/v1/chat/completions',
    });
  });

  it('summarizes payment history by service', () => {
    const entries: PaymentLogEntry[] = [
      {
        service: 'openai',
        endpoint: '/v1/chat/completions',
        amount: '0.01',
        reference: 'sig-1',
        createdAt: '2026-03-30T12:00:00.000Z',
      },
      {
        service: 'anthropic',
        endpoint: '/v1/messages',
        amount: '0.02',
        reference: 'sig-2',
        createdAt: '2026-03-30T12:01:00.000Z',
      },
      {
        service: 'openai',
        endpoint: '/v1/chat/completions',
        amount: '0.03',
        reference: 'sig-3',
        createdAt: '2026-03-30T12:02:00.000Z',
      },
    ];

    expect(summarizePayments(entries)).toEqual({
      count: 3,
      totalAmount: 0.06,
      byService: [
        { service: 'openai', count: 2, totalAmount: 0.04 },
        { service: 'anthropic', count: 1, totalAmount: 0.02 },
      ],
    });
  });

  it('declares Solana-native service metadata', () => {
    const services = buildServices('https://gateway.example');
    expect(services).toHaveLength(5);
    expect(services.every((service) => service.chain === 'solana')).toBe(true);
  });

  it('resolves dynamic proxy routes', () => {
    const route = resolveGatewayRoute('/openai/v1/chat/completions');
    expect(route?.params).toEqual({});
    expect(route?.price).toBe('0.01');
  });

  it('exposes the MVP x402 route catalog', () => {
    const services = buildServices('https://gateway.example');
    const endpointCount = services.reduce((sum, service) => sum + service.endpoints.length, 0);
    expect(endpointCount).toBe(18);
  });
});
