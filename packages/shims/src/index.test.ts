// Runs the official SDK end to end against a real LocalPay server.
import { createLocalPay, type LocalPay } from '@localpay/server';
import Razorpay from 'razorpay';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalPayClient, normalizeBaseUrl, pointAtLocalPay } from './index.ts';

let server: LocalPay;
let url: string;
beforeAll(async () => {
  server = await createLocalPay({ port: 0, autoCapture: false });
  url = await server.listen();
});
afterAll(() => server.close());

describe('normalizeBaseUrl', () => {
  it.each([
    ['http://127.0.0.1:4010', 'http://127.0.0.1:4010'],
    ['http://127.0.0.1:4010/', 'http://127.0.0.1:4010'],
    ['http://127.0.0.1:4010/v1', 'http://127.0.0.1:4010'],
    ['http://127.0.0.1:4010/v1/', 'http://127.0.0.1:4010'],
  ])('%s → %s', (input, output) => {
    expect(normalizeBaseUrl(input)).toBe(output);
  });

  it('rejects non-http URLs', () => {
    expect(() => normalizeBaseUrl('ftp://x')).toThrow(/http/);
  });
});

describe('official Node SDK against LocalPay', () => {
  it('creates, fetches and lists orders', async () => {
    const client = createLocalPayClient(Razorpay, { baseUrl: url });
    const order = await client.orders.create({ amount: 50000, currency: 'INR', receipt: 'sdk-1' });
    expect(order).toMatchObject({ entity: 'order', amount: 50000, status: 'created' });
    expect((await client.orders.fetch(order.id)).id).toBe(order.id);
    expect((await client.orders.all({ count: 5 })).items.map((o) => o.id)).toContain(order.id);
  });

  it('captures and refunds a payment', async () => {
    const client = createLocalPayClient(Razorpay, { baseUrl: `${url}/v1` });
    const order = await client.orders.create({ amount: 20000, currency: 'INR' });
    const payment = server.engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    const captured = await client.payments.capture(payment.id, 20000, 'INR');
    expect(captured).toMatchObject({ status: 'captured', captured: true });
    const refund = await client.payments.refund(payment.id, { amount: 5000 });
    expect(refund).toMatchObject({ entity: 'refund', amount: 5000, payment_id: payment.id });
    expect((await client.refunds.fetch(refund.id)).id).toBe(refund.id);
  });

  it('surfaces API errors in the SDK error shape', async () => {
    const client = createLocalPayClient(Razorpay, { baseUrl: url });
    await expect(client.orders.fetch('order_DoesNotExist00')).rejects.toMatchObject({
      statusCode: 400,
      error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' },
    });
  });

  it('turns "server not running" into a readable error', async () => {
    const client = pointAtLocalPay(new Razorpay({ key_id: 'rzp_test_x', key_secret: 'y' }), 'http://127.0.0.1:1');
    await expect(client.orders.create({ amount: 100, currency: 'INR' })).rejects.toMatchObject({
      statusCode: 503,
      error: { reason: 'localpay_unreachable', description: expect.stringContaining('Is it running?') as string },
    });
  });

  it('rejects live keys end to end', async () => {
    const client = createLocalPayClient(Razorpay, { baseUrl: url, key_id: 'rzp_live_ABCDEFGHIJKLMN', key_secret: 'x' });
    await expect(client.orders.all()).rejects.toMatchObject({ statusCode: 401 });
  });
});
