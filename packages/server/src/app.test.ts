import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalPay, type LocalPay } from './app.ts';
import { DEMO_KEY } from './config.ts';

const AUTH = `Basic ${Buffer.from(`${DEMO_KEY.keyId}:${DEMO_KEY.keySecret}`).toString('base64')}`;
const servers: LocalPay[] = [];
const start = async (...args: Parameters<typeof createLocalPay>) => {
  const server = await createLocalPay(...args);
  servers.push(server);
  return server;
};
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

describe('createLocalPay', () => {
  it('serves the API under /v1 with the demo key', async () => {
    const { app } = await start();
    const response = await app.inject({ method: 'POST', url: '/v1/orders', headers: { authorization: AUTH }, payload: { amount: 100 } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ entity: 'order', amount: 100 });
  });

  it('exposes an unauthenticated health check', async () => {
    const { app } = await start();
    expect((await app.inject({ url: '/_localpay/health' })).json()).toMatchObject({ ok: true, name: 'LocalPay' });
  });

  it('listens on loopback and reports the URL', async () => {
    const server = await start({ port: 0 });
    const url = await server.listen();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await fetch(`${url}/_localpay/health`)).status).toBe(200);
  });

  it('mounts the dashboard API behind the session token', async () => {
    const server = await start({}, { dashboardDir: null });
    expect((await server.app.inject({ url: '/_localpay/api/session' })).statusCode).toBe(401);
    const response = await server.app.inject({ url: '/_localpay/api/session', headers: { authorization: `Bearer ${server.adminAuth.token}` } });
    expect(response.json()).toMatchObject({ accountId: 'acc_LocalPayDemo01' });
    expect(server.dashboardUrl('http://127.0.0.1:4010')).toBe(`http://127.0.0.1:4010/?token=${server.adminAuth.token}`);
  });

  it('injects API faults from config and lets the dashboard change them', async () => {
    const server = await start({ apiFaults: { rateLimitRate: 1 } }, { dashboardDir: null });
    const create = () => server.app.inject({ method: 'POST', url: '/v1/orders', headers: { authorization: AUTH }, payload: { amount: 100 } });
    expect((await create()).statusCode).toBe(429);
    const admin = { authorization: `Bearer ${server.adminAuth.token}` };
    await server.app.inject({ method: 'PUT', url: '/_localpay/api/api-faults', headers: admin, payload: { rateLimitRate: 0 } });
    expect((await create()).statusCode).toBe(200);
    expect((await server.app.inject({ url: '/_localpay/health' })).statusCode).toBe(200);
  });

  it('keeps data across restarts with persist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'localpay-persist-'));
    try {
      const file = join(dir, 'events.jsonl');
      const first = await start({ persist: file });
      const order = first.engine.createOrder({ amount: 100 });
      await first.close();
      const second = await start({ persist: file });
      expect(second.engine.getOrder(order.id).amount).toBe(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('supports time travel on a running server', async () => {
    const { engine } = await start({ refundDelaySeconds: 3600 });
    const order = engine.createOrder({ amount: 100 });
    const payment = engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    const refund = engine.createRefund(payment.id);
    engine.advanceTime(3_600_000);
    expect(engine.getRefund(refund.id).status).toBe('processed');
  });
});
