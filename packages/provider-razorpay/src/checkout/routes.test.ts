import { createEngine } from '@localpay/core';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { verifyCheckoutSignature } from '../signatures.ts';
import { verifySubscriptionSignature } from '../subscriptions/serializer.ts';
import { TEST_KEY } from '../test-helpers.ts';
import { checkoutApi, isAllowedOrigin } from './routes.ts';

const setup = async () => {
  const engine = createEngine({ seed: 'checkout' });
  const app = Fastify();
  await app.register(checkoutApi, { prefix: '/_localpay/checkout', engine, keys: [TEST_KEY], allowedOrigins: ['https://shop.test'] });
  const order = engine.createOrder({ amount: 50000 });
  const pay = (body: Record<string, unknown>, origin = 'http://localhost:3000') =>
    app.inject({ method: 'POST', url: '/_localpay/checkout/pay', headers: { origin }, payload: { key_id: TEST_KEY.keyId, order_id: order.id, method: 'upi', ...body } });
  return { app, engine, order, pay };
};

describe('checkout API', () => {
  it('pays successfully and returns a verifiable signature', async () => {
    const { pay, order, engine } = await setup();
    const response = await pay({ scenario: 'success', vpa: 'someone@upi' });
    const body = response.json<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }>();
    expect(body.razorpay_order_id).toBe(order.id);
    expect(verifyCheckoutSignature({ orderId: order.id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature }, TEST_KEY.keySecret)).toBe(true);
    expect(engine.getPayment(body.razorpay_payment_id)).toMatchObject({ status: 'captured', vpa: 'someone@upi' });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('reports failures in the checkout error shape', async () => {
    const { pay, order } = await setup();
    const body = (await pay({ scenario: 'bank_down' })).json<{ error: Record<string, unknown> }>();
    expect(body.error).toMatchObject({ code: 'GATEWAY_ERROR', reason: 'bank_technical_error', source: 'bank', metadata: { order_id: order.id } });
    expect((body.error.metadata as { payment_id: string }).payment_id).toMatch(/^pay_/);
  });

  it('stops at authorized for authorize_only', async () => {
    const { pay, engine } = await setup();
    const body = (await pay({ scenario: 'authorize_only' })).json<{ razorpay_payment_id: string }>();
    expect(engine.getPayment(body.razorpay_payment_id).status).toBe('authorized');
  });

  it('applies magic amounts', async () => {
    const { app, engine } = await setup();
    const order = engine.createOrder({ amount: 10013 });
    const response = await app.inject({ method: 'POST', url: '/_localpay/checkout/pay', payload: { key_id: TEST_KEY.keyId, order_id: order.id, method: 'card', scenario: 'success' } });
    expect(response.json()).toMatchObject({ error: { reason: 'bank_timeout' } });
  });

  it('rejects unknown keys, live keys and unknown scenarios', async () => {
    const { pay } = await setup();
    expect((await pay({ scenario: 'success', key_id: 'rzp_test_Unknown0000000' })).statusCode).toBe(401);
    expect((await pay({ scenario: 'success', key_id: 'rzp_live_ABCDEFGHIJKLMN' })).json()).toMatchObject({ error: { description: expect.stringContaining('never accepts live keys') as string } });
    expect((await pay({ scenario: 'teleport' })).json()).toMatchObject({ error: { field: 'scenario' } });
  });

  it('refuses a second payment on a paid order', async () => {
    const { pay } = await setup();
    await pay({ scenario: 'success' });
    expect((await pay({ scenario: 'success' })).json()).toMatchObject({ error: { reason: 'order_already_paid' } });
  });

  it('blocks foreign origins and answers preflight for allowed ones', async () => {
    const { app, pay } = await setup();
    expect((await pay({ scenario: 'success' }, 'https://evil.example')).statusCode).toBe(403);
    expect((await pay({ scenario: 'success' }, 'https://shop.test')).statusCode).toBe(200);
    const preflight = await app.inject({ method: 'OPTIONS', url: '/_localpay/checkout/pay', headers: { origin: 'http://127.0.0.1:5173' } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-methods']).toBe('GET, POST');
  });

  it('serves order details and the scenario list', async () => {
    const { app, order } = await setup();
    const details = await app.inject({ url: `/_localpay/checkout/orders/${order.id}?key_id=${TEST_KEY.keyId}` });
    expect(details.json()).toMatchObject({ id: order.id, amount: 50000, amount_due: 50000, currency: 'INR' });
    const scenarios = await app.inject({ url: '/_localpay/checkout/scenarios' });
    expect(scenarios.json<{ scenarios: unknown[] }>().scenarios).toHaveLength(5);
  });
});

describe('checkout for subscriptions', () => {
  it('authenticates a subscription and signs payment_id|subscription_id', async () => {
    const { app, engine } = await setup();
    const plan = engine.createPlan({ period: 'monthly', interval: 1, item: { name: 'Pro', amount: 49900 } });
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 6 });
    const details = await app.inject({ url: `/_localpay/checkout/subscriptions/${sub.id}?key_id=${TEST_KEY.keyId}` });
    expect(details.json()).toMatchObject({ id: sub.id, amount: 49900, currency: 'INR', plan: 'Pro' });
    const response = await app.inject({ method: 'POST', url: '/_localpay/checkout/pay', payload: { key_id: TEST_KEY.keyId, subscription_id: sub.id, method: 'card', scenario: 'success' } });
    const body = response.json<{ razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }>();
    expect(body.razorpay_subscription_id).toBe(sub.id);
    expect(verifySubscriptionSignature({ paymentId: body.razorpay_payment_id, subscriptionId: sub.id, signature: body.razorpay_signature }, TEST_KEY.keySecret)).toBe(true);
    expect(engine.getSubscription(sub.id).status).toBe('active');
  });

  it('needs exactly one of order_id and subscription_id', async () => {
    const { app } = await setup();
    const response = await app.inject({ method: 'POST', url: '/_localpay/checkout/pay', payload: { key_id: TEST_KEY.keyId, method: 'card', scenario: 'success' } });
    expect(response.json()).toMatchObject({ error: { description: 'Send exactly one of order_id or subscription_id.' } });
  });
});

describe('isAllowedOrigin', () => {
  it.each(['http://localhost:3000', 'http://127.0.0.1:8080', 'https://localhost', 'http://[::1]:4000', 'http://shop.localhost:3000'])('allows %s', (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  it.each(['https://example.com', 'http://localhost.evil.com', 'http://192.168.1.4:3000'])('blocks %s', (origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });
});
