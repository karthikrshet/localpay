import { EngineError } from '@localpay/core';
import { describe, expect, it } from 'vitest';
import { badRequest } from './errors.ts';
import { toApiError } from './plugin.ts';
import { buildTestApp } from './test-helpers.ts';

describe('razorpayApi plugin', () => {
  it('rejects requests without credentials with 401 and the envelope', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/v1/orders' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'BAD_REQUEST_ERROR', description: 'Please provide your api key for authentication purposes.' } });
  });

  it('answers unknown URLs with a 400 envelope once authenticated', async () => {
    const { call } = await buildTestApp();
    const { status, body } = await call('GET', '/v1/nothing-here');
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: { description: 'The requested URL was not found on the server.' } });
  });

  it('maps malformed JSON to a 400 envelope', async () => {
    const { app } = await buildTestApp([(scoped) => scoped.post('/echo', (_req, reply) => reply.send({}))]);
    const response = await app.inject({
      method: 'POST', url: '/v1/echo', payload: '{oops',
      headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from('rzp_test_LocalPayDemo01:demo_secret').toString('base64')}` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { description: 'The request body must be valid JSON.' } });
  });

  it('turns unexpected exceptions into a 500 SERVER_ERROR without leaking details', async () => {
    const { call } = await buildTestApp([(scoped) => scoped.get('/boom', () => { throw new Error('secret internals'); })]);
    const { status, body } = await call('GET', '/v1/boom');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret internals');
    expect(body).toMatchObject({ error: { code: 'SERVER_ERROR' } });
  });
});

describe('API fault injection', () => {
  it('answers 429 or 500 before any handler runs, so nothing changes', async () => {
    const engine = (await import('@localpay/core')).createEngine({ seed: 'faults' });
    const Fastify = (await import('fastify')).default;
    const { orderRoutes } = await import('./routes/orders.ts');
    const { razorpayApi } = await import('./plugin.ts');
    let faults = { rateLimitRate: 1, serverErrorRate: 0, delayMs: 0 };
    const app = Fastify();
    await app.register(razorpayApi, { prefix: '/v1', engine, keys: [{ keyId: 'rzp_test_LocalPayDemo01', keySecret: 'demo_secret' }], routes: [orderRoutes], faults: () => faults, random: { next: () => 0.5 } });
    const create = () => app.inject({ method: 'POST', url: '/v1/orders', payload: { amount: 100 }, headers: { authorization: `Basic ${Buffer.from('rzp_test_LocalPayDemo01:demo_secret').toString('base64')}` } });
    const limited = await create();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { reason: 'rate_limit_exceeded' } });
    faults = { rateLimitRate: 0, serverErrorRate: 1, delayMs: 0 };
    expect((await create()).statusCode).toBe(500);
    expect(engine.listOrders()).toEqual([]);
    faults = { rateLimitRate: 0, serverErrorRate: 0, delayMs: 30 };
    expect((await create()).statusCode).toBe(200);
  });
});

describe('toApiError', () => {
  it('passes ApiErrors through and maps EngineErrors', () => {
    const api = badRequest('x');
    expect(toApiError(api)).toBe(api);
    expect(toApiError(new EngineError('not_found', 'x', 'id')).body.description).toBe('The id provided does not exist');
  });
});
