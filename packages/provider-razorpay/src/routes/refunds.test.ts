import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-helpers.ts';
import { refundRoutes } from './refunds.ts';

const setup = async () => {
  const env = await buildTestApp([refundRoutes], { seed: 'refunds-api' });
  const order = env.engine.createOrder({ amount: 50000 });
  const payment = env.engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
  return { ...env, payment };
};

describe('refunds API', () => {
  it('POST /v1/payments/:id/refund creates a full refund by default', async () => {
    const { call, payment } = await setup();
    const { status, body } = await call('POST', `/v1/payments/${payment.id}/refund`, {});
    expect(status).toBe(200);
    expect(body).toMatchObject({ entity: 'refund', amount: 50000, payment_id: payment.id, status: 'pending', speed_requested: 'normal' });
  });

  it('creates partial refunds and rejects over-refunds', async () => {
    const { call, payment } = await setup();
    expect((await call('POST', `/v1/payments/${payment.id}/refund`, { amount: 20000, speed: 'optimum', receipt: 'r1', notes: { why: 'size' } })).body).toMatchObject({
      amount: 20000, speed_requested: 'optimum', receipt: 'r1', notes: { why: 'size' },
    });
    const over = await call('POST', `/v1/payments/${payment.id}/refund`, { amount: 30001 });
    expect(over).toMatchObject({ status: 400, body: { error: { reason: 'refund_exceeds_payment', field: 'amount' } } });
  });

  it('lists and fetches refunds globally and per payment', async () => {
    const { call, payment } = await setup();
    const created = await call('POST', `/v1/payments/${payment.id}/refund`, { amount: 1000 });
    const id = String(created.body.id);
    expect((await call('GET', '/v1/refunds')).body).toMatchObject({ entity: 'collection', count: 1 });
    expect((await call('GET', `/v1/payments/${payment.id}/refunds`)).body).toMatchObject({ count: 1 });
    expect((await call('GET', `/v1/refunds/${id}`)).body).toMatchObject({ id });
    expect((await call('GET', `/v1/payments/${payment.id}/refunds/${id}`)).body).toMatchObject({ id });
    expect((await call('GET', `/v1/payments/pay_Other000000000/refunds/${id}`)).status).toBe(400);
  });

  it('PATCH /v1/refunds/:id updates notes', async () => {
    const { call, payment } = await setup();
    const created = await call('POST', `/v1/payments/${payment.id}/refund`, { amount: 1000 });
    expect((await call('PATCH', `/v1/refunds/${String(created.body.id)}`, { notes: { a: 'b' } })).body).toMatchObject({ notes: { a: 'b' } });
  });
});
