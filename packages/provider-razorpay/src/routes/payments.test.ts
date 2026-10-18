import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-helpers.ts';
import { paymentRoutes } from './payments.ts';

const setup = async () => {
  const env = await buildTestApp([paymentRoutes], { seed: 'payments-api', config: { autoCapture: false } });
  const order = env.engine.createOrder({ amount: 50000 });
  const payment = env.engine.attemptPayment({ orderId: order.id, method: 'card', outcome: { kind: 'success' } });
  return { ...env, order, payment };
};

describe('payments API', () => {
  it('GET /v1/payments/:id returns the payment', async () => {
    const { call, payment, order } = await setup();
    const { status, body } = await call('GET', `/v1/payments/${payment.id}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: payment.id, entity: 'payment', status: 'authorized', captured: false, order_id: order.id, method: 'card' });
  });

  it('POST /v1/payments/:id/capture captures and returns fees', async () => {
    const { call, payment, engine, order } = await setup();
    const { status, body } = await call('POST', `/v1/payments/${payment.id}/capture`, { amount: 50000, currency: 'INR' });
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'captured', captured: true, fee: 1180, tax: 180 });
    expect(engine.getOrder(order.id).status).toBe('paid');
  });

  it('capture rejects a wrong amount and a second capture', async () => {
    const { call, payment } = await setup();
    const wrong = await call('POST', `/v1/payments/${payment.id}/capture`, { amount: 100 });
    expect(wrong).toMatchObject({ status: 400, body: { error: { field: 'amount', reason: 'capture_amount_mismatch' } } });
    await call('POST', `/v1/payments/${payment.id}/capture`, { amount: 50000 });
    const again = await call('POST', `/v1/payments/${payment.id}/capture`, { amount: 50000 });
    expect(again.body).toMatchObject({ error: { description: 'This payment has already been captured' } });
  });

  it('capture requires an amount', async () => {
    const { call, payment } = await setup();
    expect((await call('POST', `/v1/payments/${payment.id}/capture`, {})).body).toMatchObject({ error: { field: 'amount' } });
  });

  it('GET /v1/payments lists payments as a collection', async () => {
    const { call } = await setup();
    expect((await call('GET', '/v1/payments?count=5')).body).toMatchObject({ entity: 'collection', count: 1 });
  });

  it('PATCH /v1/payments/:id updates notes', async () => {
    const { call, payment } = await setup();
    expect((await call('PATCH', `/v1/payments/${payment.id}`, { notes: { ref: 'x' } })).body).toMatchObject({ notes: { ref: 'x' } });
  });
});
