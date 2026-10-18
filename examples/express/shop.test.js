// The example shop against a real LocalPay, without a browser: the checkout API call
// stands in for clicking a scenario button.
import { createLocalPay } from '@localpay/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShop } from './server.js';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((close) => close()));
});

async function start(localpayConfig = {}) {
  const localpay = await createLocalPay({ port: 0, ...localpayConfig });
  const localpayUrl = await localpay.listen();
  servers.push(() => localpay.close());
  const shop = createShop({ LOCALPAY_URL: localpayUrl });
  const http = await new Promise((resolve) => {
    const s = shop.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(() => new Promise((resolve) => http.close(resolve)));
  const shopUrl = `http://127.0.0.1:${http.address().port}`;
  localpay.webhookTargets.push({ id: 'shop', url: `${shopUrl}/webhooks`, secret: 'localpay_webhook_secret' });
  return { localpay, localpayUrl, shop, shopUrl };
}

async function buy({ localpayUrl, shopUrl }, scenario) {
  const order = await (await fetch(`${shopUrl}/api/orders`, { method: 'POST' })).json();
  const result = await (
    await fetch(`${localpayUrl}/_localpay/checkout/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: shopUrl },
      body: JSON.stringify({ key_id: order.key, order_id: order.order_id, method: 'upi', scenario }),
    })
  ).json();
  return { order, result };
}

const verify = async (shopUrl, result) => (await fetch(`${shopUrl}/api/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) })).json();
const status = async (shopUrl, orderId) => (await fetch(`${shopUrl}/api/orders/${orderId}`)).json();

describe('example shop', () => {
  it('verifies the checkout signature and fulfils on the capture webhook', async () => {
    const env = await start();
    const { order, result } = await buy(env, 'success');
    expect(await verify(env.shopUrl, result)).toEqual({ verified: true });
    await vi.waitFor(async () => expect((await status(env.shopUrl, order.order_id)).status).toBe('fulfilled'), { timeout: 5000 });
    expect((await status(env.shopUrl, order.order_id)).events).toEqual(['payment.authorized', 'payment.captured', 'order.paid']);
  });

  it('rejects a tampered signature', async () => {
    const env = await start();
    const { result } = await buy(env, 'success');
    expect(await verify(env.shopUrl, { ...result, razorpay_signature: '0'.repeat(64) })).toEqual({ verified: false });
  });

  it('does not fulfil an authorized-but-uncaptured payment', async () => {
    const env = await start();
    const { order } = await buy(env, 'authorize_only');
    await vi.waitFor(async () => expect((await status(env.shopUrl, order.order_id)).events).toEqual(['payment.authorized']), { timeout: 5000 });
    expect((await status(env.shopUrl, order.order_id)).status).toBe('created');
  });

  it('ignores duplicate webhook deliveries', async () => {
    const env = await start({ faults: { duplicateRate: 1 } });
    const { order } = await buy(env, 'insufficient_funds');
    await vi.waitFor(() => expect(env.localpay.dispatcher.list().filter((d) => d.status === 'delivered')).toHaveLength(2), { timeout: 5000 });
    expect((await status(env.shopUrl, order.order_id)).events).toEqual(['payment.failed']);
  });
});
