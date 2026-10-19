// Calls the route handlers directly against a real LocalPay (they only use standard
// Request/Response). Needs LocalPay on LOCALPAY_URL (default http://127.0.0.1:4010).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

process.env.LOCALPAY_URL ??= 'http://127.0.0.1:4010';
const LOCALPAY = process.env.LOCALPAY_URL;

const { POST: createOrder } = await import('../app/api/orders/route.ts');
const { POST: verify } = await import('../app/api/verify/route.ts');
const { POST: webhook } = await import('../app/api/webhooks/route.ts');
const { GET: orderStatus } = await import('../app/api/orders/[id]/route.ts');

async function pay(scenario: string) {
  const order = (await (await createOrder()).json()) as { order_id: string; key: string };
  const response = await fetch(`${LOCALPAY}/_localpay/checkout/pay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key_id: order.key, order_id: order.order_id, method: 'upi', scenario }),
  });
  return { order, result: (await response.json()) as Record<string, string> };
}

const signedWebhook = (body: object, eventId: string) => {
  const raw = JSON.stringify(body);
  return new Request('http://localhost/api/webhooks', {
    method: 'POST',
    body: raw,
    headers: { 'x-razorpay-signature': createHmac('sha256', 'localpay_webhook_secret').update(raw).digest('hex'), 'x-razorpay-event-id': eventId },
  });
};
const status = async (id: string) => (await (await orderStatus(new Request('http://localhost'), { params: Promise.resolve({ id }) })).json()) as { status: string; events: string[] };

test('creates an order through the SDK pointed at LocalPay and verifies the checkout signature', async () => {
  const { order, result } = await pay('success');
  assert.match(order.order_id, /^order_/);
  const response = await verify(new Request('http://localhost/api/verify', { method: 'POST', body: JSON.stringify(result) }));
  assert.deepEqual(await response.json(), { verified: true });
  const tampered = await verify(new Request('http://localhost/api/verify', { method: 'POST', body: JSON.stringify({ ...result, razorpay_signature: '0'.repeat(64) }) }));
  assert.equal(tampered.status, 400);
});

test('webhooks: rejects bad signatures, fulfils on capture, ignores duplicates and authorization', async () => {
  const { order } = await pay('success');
  const payload = (event: string) => ({ event, payload: { payment: { entity: { order_id: order.order_id } } } });
  assert.equal((await webhook(new Request('http://localhost', { method: 'POST', body: '{}', headers: { 'x-razorpay-signature': 'nope' } }))).status, 400);
  await webhook(signedWebhook(payload('payment.authorized'), 'evt_a'));
  assert.equal((await status(order.order_id)).status, 'created');
  await webhook(signedWebhook(payload('payment.captured'), 'evt_b'));
  assert.equal(await (await webhook(signedWebhook(payload('payment.captured'), 'evt_b'))).text(), 'duplicate ignored');
  assert.deepEqual(await status(order.order_id), { status: 'fulfilled', events: ['payment.authorized', 'payment.captured'] });
});
