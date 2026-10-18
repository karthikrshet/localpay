// A tiny shop that takes test payments. It shows the patterns that matter:
//   1. create orders on the server, never trust amounts from the browser;
//   2. verify the checkout signature in constant time;
//   3. verify webhook signatures over the RAW body, de-duplicate by event id;
//   4. fulfil only on payment.captured / order.paid, never on payment.authorized.
//
// With LOCALPAY_URL set, everything talks to LocalPay; unset, to Razorpay test mode.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import Razorpay from 'razorpay';
import { pointAtLocalPay } from '@localpay/shim-node';

export function createShop(env = process.env) {
  const keyId = env.RAZORPAY_KEY_ID ?? 'rzp_test_LocalPayDemo01';
  const keySecret = env.RAZORPAY_KEY_SECRET ?? 'localpay_demo_secret';
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET ?? 'localpay_webhook_secret';
  const localpayUrl = env.LOCALPAY_URL;
  const checkoutScript = localpayUrl ? `${localpayUrl}/v1/checkout.js` : 'https://checkout.razorpay.com/v1/checkout.js';

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  if (localpayUrl) pointAtLocalPay(razorpay, localpayUrl); // the one line that switches to LocalPay

  /** order_id → { status: 'created' | 'verified' | 'fulfilled' | 'failed', events: string[] } */
  const orders = new Map();
  const seenEventIds = new Set();

  const hmac = (message, secret) => createHmac('sha256', secret).update(message).digest('hex');
  const safeEqual = (a, b) => {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length === right.length && timingSafeEqual(left, right);
  };

  const app = express();

  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LocalPay demo shop</title>
<style>body{font:16px system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#0F172A}button{font:inherit;padding:.6rem 1rem;border-radius:8px;border:0;background:#2563EB;color:#fff;cursor:pointer}#status{margin-top:1rem;min-height:1.5em}</style>
</head>
<body>
<h1>Demo shop</h1>
<p>Test T-shirt — ₹499.00</p>
<button id="buy" type="button">Buy</button>
<p id="status" role="status"></p>
<script src="${checkoutScript}"></script>
<script>
const status = document.getElementById('status');
async function waitForFulfilment(orderId) {
  for (let i = 0; i < 50; i++) {
    const order = await (await fetch('/api/orders/' + orderId)).json();
    if (order.status === 'fulfilled') { status.textContent = 'Order fulfilled'; return; }
    await new Promise((r) => setTimeout(r, 200));
  }
  status.textContent = 'Paid, but no capture webhook yet';
}
document.getElementById('buy').addEventListener('click', async () => {
  const order = await (await fetch('/api/orders', { method: 'POST' })).json();
  const rzp = new Razorpay({
    key: order.key, order_id: order.order_id, amount: order.amount, currency: order.currency,
    name: 'Demo shop', description: 'Test T-shirt',
    handler: async (response) => {
      const result = await (await fetch('/api/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(response) })).json();
      status.textContent = result.verified ? 'Payment verified. Waiting for the capture webhook…' : 'Signature check failed';
      if (result.verified) waitForFulfilment(order.order_id);
    },
    modal: { ondismiss: () => { status.textContent = 'Checkout closed'; } },
  });
  rzp.on('payment.failed', (response) => { status.textContent = 'Payment failed: ' + response.error.description; });
  rzp.open();
});
</script>
</body>
</html>`);
  });

  app.post('/api/orders', async (_req, res, next) => {
    try {
      const order = await razorpay.orders.create({ amount: 49900, currency: 'INR', receipt: `shop-${orders.size + 1}` });
      orders.set(order.id, { status: 'created', events: [] });
      res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key: keyId });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/verify', express.json(), (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body ?? {};
    const verified = Boolean(orderId && paymentId && signature) && safeEqual(hmac(`${orderId}|${paymentId}`, keySecret), signature);
    const order = orders.get(orderId);
    if (verified && order && order.status === 'created') order.status = 'verified';
    res.status(verified ? 200 : 400).json({ verified });
  });

  // Raw body: the signature covers the exact bytes, so do not parse before verifying.
  app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    const signature = req.get('x-razorpay-signature');
    if (!signature || !safeEqual(hmac(raw, webhookSecret), signature)) return res.status(400).send('bad signature');

    const eventId = req.get('x-razorpay-event-id');
    if (eventId && seenEventIds.has(eventId)) return res.status(200).send('duplicate ignored');
    if (eventId) seenEventIds.add(eventId);

    const event = JSON.parse(raw);
    const payment = event.payload?.payment?.entity;
    const order = payment ? orders.get(payment.order_id) : undefined;
    if (order) {
      order.events.push(event.event);
      if (event.event === 'payment.captured' || event.event === 'order.paid') order.status = 'fulfilled';
      else if (event.event === 'payment.failed' && order.status !== 'fulfilled') order.status = 'failed';
      // payment.authorized: money is only blocked, not ours yet. Do nothing.
    }
    res.status(200).send('ok');
  });

  app.get('/api/orders/:id', (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'unknown order' });
    res.json(order);
  });

  return { app, orders };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  createShop().app.listen(port, '127.0.0.1', () => {
    console.log(`Demo shop on http://127.0.0.1:${port} (payments via ${process.env.LOCALPAY_URL ?? 'Razorpay test mode'})`);
  });
}
