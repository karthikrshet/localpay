import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-helpers.ts';
import { orderRoutes } from './orders.ts';

const setup = () => buildTestApp([orderRoutes]);

describe('orders API', () => {
  it('POST /v1/orders creates an order', async () => {
    const { call } = await setup();
    const { status, body } = await call('POST', '/v1/orders', { amount: 50000, currency: 'INR', receipt: 'rcpt-1', notes: { sku: 'A' } });
    expect(status).toBe(200);
    expect(body).toMatchObject({ entity: 'order', amount: 50000, amount_paid: 0, amount_due: 50000, currency: 'INR', receipt: 'rcpt-1', status: 'created', attempts: 0, notes: { sku: 'A' } });
    expect(body.id).toMatch(/^order_[0-9A-Za-z]{14}$/);
  });

  it('POST /v1/orders validates the body', async () => {
    const { call } = await setup();
    const { status, body } = await call('POST', '/v1/orders', { amount: 10 });
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: { code: 'BAD_REQUEST_ERROR', field: 'amount' } });
  });

  it('GET /v1/orders/:id fetches, and unknown ids get the gateway error', async () => {
    const { call } = await setup();
    const created = await call('POST', '/v1/orders', { amount: 100 });
    expect((await call('GET', `/v1/orders/${String(created.body.id)}`)).body).toEqual(created.body);
    const missing = await call('GET', '/v1/orders/order_DoesNotExist00');
    expect(missing).toMatchObject({ status: 400, body: { error: { description: 'The id provided does not exist' } } });
  });

  it('GET /v1/orders lists newest first with count, skip and receipt filters', async () => {
    const { call } = await setup();
    for (const receipt of ['a', 'b', 'c']) await call('POST', '/v1/orders', { amount: 100, receipt });
    const all = await call('GET', '/v1/orders');
    expect(all.body).toMatchObject({ entity: 'collection', count: 3 });
    expect((all.body.items as { receipt: string }[]).map((o) => o.receipt)).toEqual(['c', 'b', 'a']);
    const page = await call('GET', '/v1/orders?count=1&skip=1');
    expect((page.body.items as { receipt: string }[]).map((o) => o.receipt)).toEqual(['b']);
    const filtered = await call('GET', '/v1/orders?receipt=a');
    expect(filtered.body.count).toBe(1);
  });

  it('PATCH /v1/orders/:id updates notes only', async () => {
    const { call } = await setup();
    const created = await call('POST', '/v1/orders', { amount: 100 });
    const id = String(created.body.id);
    expect((await call('PATCH', `/v1/orders/${id}`, { notes: { k: 'v' } })).body).toMatchObject({ notes: { k: 'v' } });
    expect((await call('PATCH', `/v1/orders/${id}`, { amount: 5 })).status).toBe(400);
  });

  it('GET /v1/orders/:id/payments lists the payments of an order', async () => {
    const { call, engine } = await setup();
    const created = await call('POST', '/v1/orders', { amount: 100 });
    engine.attemptPayment({ orderId: String(created.body.id), method: 'upi', outcome: { kind: 'success' } });
    const { body } = await call('GET', `/v1/orders/${String(created.body.id)}/payments`);
    expect(body).toMatchObject({ entity: 'collection', count: 1, items: [{ entity: 'payment', status: 'captured' }] });
  });

  it('payment_capture: 0 makes payments stop at authorized', async () => {
    const { call, engine } = await setup();
    const created = await call('POST', '/v1/orders', { amount: 100, payment_capture: 0 });
    expect(engine.attemptPayment({ orderId: String(created.body.id), method: 'upi', outcome: { kind: 'success' } }).status).toBe('authorized');
    const authorized = await call('GET', '/v1/orders?authorized=1');
    expect(authorized.body.count).toBe(1);
  });
});
