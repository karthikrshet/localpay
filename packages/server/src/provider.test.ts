// The provider seam: a different gateway plugs in without touching core or the server.
import type { Provider } from '@localpay/core';
import type { SendRequest } from '@localpay/webhooks';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalPay, type LocalPay } from './app.ts';

let server: LocalPay | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

/** A toy gateway: one route to create orders, and webhooks in its own shape. */
const toyProvider: Provider<FastifyInstance> = {
  name: 'toy',
  isTestKeyId: (keyId) => keyId.startsWith('toy_test_'),
  register(app, { engine }) {
    app.post<{ Body: { cents: number } }>('/toy/orders', (request, reply) => reply.send({ ref: engine.createOrder({ amount: request.body.cents }).id }));
    return Promise.resolve();
  },
  webhookFormat: ({ accountId }) => ({
    events: ['ORDER_CREATED'],
    format: (event) => (event.type === 'order.created' ? { name: 'ORDER_CREATED', payload: { merchant: accountId, ref: event.data.order.id } } : null),
    headers: (_body, secret, eventId) => ({ 'x-toy-event': eventId, 'x-toy-secret-length': String(secret.length) }),
  }),
};

describe('provider plug-ins', () => {
  it('serves another provider\'s routes and webhook format through the same engine', async () => {
    const sent: SendRequest[] = [];
    server = await createLocalPay(
      { webhooks: [{ url: 'http://127.0.0.1:9/hook', secret: 'abc' }], accountId: 'toy-merchant' },
      { provider: toyProvider, dashboardDir: null, send: (r) => { sent.push(r); return Promise.resolve({ statusCode: 200, responseBody: '', latencyMs: 1 }); } },
    );
    const response = await server.app.inject({ method: 'POST', url: '/toy/orders', payload: { cents: 1234 } });
    const { ref } = response.json<{ ref: string }>();
    expect(server.engine.getOrder(ref).amount).toBe(1234);
    await server.tick();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]?.body ?? '{}')).toEqual({ merchant: 'toy-merchant', ref });
    expect(sent[0]?.headers['x-toy-secret-length']).toBe('3');
    // The Razorpay routes are not mounted.
    expect((await server.app.inject({ url: '/v1/orders' })).statusCode).toBe(404);
  });
});
