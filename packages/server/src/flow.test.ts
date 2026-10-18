// End to end inside one process: order via the REST API, payment via the checkout API,
// signed webhooks delivered to a receiver, refund processed by the scheduler.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { verifyCheckoutSignature, verifyWebhookSignature } from '@localpay/provider-razorpay';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalPay, type LocalPay } from './app.ts';
import { DEMO_KEY } from './config.ts';

const AUTH = `Basic ${Buffer.from(`${DEMO_KEY.keyId}:${DEMO_KEY.keySecret}`).toString('base64')}`;
const SECRET = 'whsec_test';

interface Received {
  event: string;
  eventId: string;
  signature: string;
  body: string;
}

let receiver: Server | null = null;
let localpay: LocalPay | null = null;

async function startReceiver(): Promise<{ url: string; received: Received[] }> {
  const received: Received[] = [];
  receiver = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      received.push({
        event: (JSON.parse(body) as { event: string }).event,
        eventId: String(req.headers['x-razorpay-event-id']),
        signature: String(req.headers['x-razorpay-signature'] ?? ''),
        body,
      });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((resolve) => receiver?.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/webhooks`, received };
}

const waitFor = (check: () => boolean) =>
  vi.waitFor(() => {
    if (!check()) throw new Error('not yet');
  }, { timeout: 5000, interval: 10 });

afterEach(async () => {
  await localpay?.close();
  await new Promise((resolve) => (receiver ? receiver.close(resolve) : resolve(undefined)));
  localpay = null;
  receiver = null;
});

describe('order → checkout → webhooks → refund', () => {
  it('runs the whole MVP flow with signed webhooks', async () => {
    const { url, received } = await startReceiver();
    localpay = await createLocalPay({ webhooks: [{ url, secret: SECRET }], refundDelaySeconds: 3600 }, { checkoutScript: () => Promise.resolve('/* test */') });
    const { app } = localpay;

    const order = (await app.inject({ method: 'POST', url: '/v1/orders', headers: { authorization: AUTH }, payload: { amount: 50000, receipt: 'e2e' } })).json<{ id: string }>();
    const paid = (
      await app.inject({ method: 'POST', url: '/_localpay/checkout/pay', headers: { origin: 'http://localhost:3000' }, payload: { key_id: DEMO_KEY.keyId, order_id: order.id, method: 'upi', scenario: 'success' } })
    ).json<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }>();
    expect(verifyCheckoutSignature({ orderId: order.id, paymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature }, DEMO_KEY.keySecret)).toBe(true);

    await waitFor(() => received.length >= 3);
    expect(received.map((r) => r.event)).toEqual(['payment.authorized', 'payment.captured', 'order.paid']);
    for (const r of received) expect(verifyWebhookSignature(r.body, r.signature, SECRET)).toBe(true);
    expect(new Set(received.map((r) => r.eventId)).size).toBe(3);

    const refund = (await app.inject({ method: 'POST', url: `/v1/payments/${paid.razorpay_payment_id}/refund`, headers: { authorization: AUTH }, payload: { amount: 10000 } })).json<{ id: string }>();
    await waitFor(() => received.some((r) => r.event === 'refund.created'));
    localpay.engine.advanceTime(3_600_000);
    await waitFor(() => received.some((r) => r.event === 'refund.processed'));
    expect(localpay.engine.getRefund(refund.id).status).toBe('processed');
    // The receiver can see the last webhook a moment before the dispatcher records the 200.
    await waitFor(() => localpay?.dispatcher.list().every((d) => d.status === 'delivered') ?? false);
  });

  it('serves checkout.js without authentication and with the origin config', async () => {
    localpay = await createLocalPay({ allowedOrigins: ['https://shop.test'] }, { checkoutScript: () => Promise.resolve('/* bundle */') });
    const response = await localpay.app.inject({ url: '/v1/checkout.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/javascript');
    expect(response.body).toContain('"allowedOrigins":["https://shop.test"]');
    expect(response.body).toContain('/* bundle */');
  });

  it('builds checkout.js from source when no bundle exists', async () => {
    localpay = await createLocalPay();
    const response = await localpay.app.inject({ url: '/v1/checkout.js' });
    expect(response.body).toContain('TEST MODE');
  });

  it('applies webhook fault injection from config', async () => {
    const { url, received } = await startReceiver();
    localpay = await createLocalPay({ webhooks: [{ url, secret: SECRET, events: ['payment.failed'] }], faults: { duplicateRate: 1 } });
    const order = localpay.engine.createOrder({ amount: 100 });
    localpay.engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'fail', error: { code: 'BAD_REQUEST_ERROR', description: 'x', source: 'bank', step: 'payment_authorization', reason: 'x' } } });
    await waitFor(() => received.length >= 2);
    expect(received.map((r) => r.event)).toEqual(['payment.failed', 'payment.failed']);
    expect(received[0]?.eventId).toBe(received[1]?.eventId);
  });
});
