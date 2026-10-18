import { createEngine } from '@localpay/core';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { TEST_KEY } from '../test-helpers.ts';
import { escapeHtml, paymentLinkPages } from './page.ts';
import { verifyPaymentLinkSignature } from './serializer.ts';

const setup = async () => {
  const engine = createEngine({ seed: 'plink-page' });
  const app = Fastify();
  await app.register(paymentLinkPages, { engine, keys: [TEST_KEY] });
  return { app, engine };
};

describe('payment link page', () => {
  it('renders the amount due and loads checkout under a strict CSP', async () => {
    const { app, engine } = await setup();
    const link = engine.createPaymentLink({ amount: 249913, description: 'Invoice <42>', referenceId: 'INV-42', customer: { name: 'Asha "A"' } });
    const response = await app.inject({ url: `/l/${link.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('₹2,499.13');
    expect(response.body).toContain('Invoice &lt;42&gt;');
    expect(response.body).toContain('Asha &quot;A&quot;');
    expect(response.body).toContain(`data-order="${link.orderId}"`);
    expect(response.body).toContain('<script src="/v1/checkout.js"></script>');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.body).not.toMatch(/<script>(?!<\/script>)/);
  });

  it('shows closed links without a pay button', async () => {
    const { app, engine } = await setup();
    const link = engine.createPaymentLink({ amount: 100 });
    engine.cancelPaymentLink(link.id);
    const body = (await app.inject({ url: `/l/${link.id}` })).body;
    expect(body).toContain('was cancelled');
    expect(body).not.toContain('id="pay"');
    expect((await app.inject({ url: '/l/plink_missing00000000' })).statusCode).toBe(404);
  });

  it('returns a signed callback redirect after payment', async () => {
    const { app, engine } = await setup();
    const link = engine.createPaymentLink({ amount: 100, referenceId: 'R-9', callbackUrl: 'http://localhost:3000/paid?src=link', callbackMethod: 'get' });
    const payment = engine.attemptPayment({ orderId: link.orderId, method: 'upi', outcome: { kind: 'success' } });
    const result = (await app.inject({ method: 'POST', url: `/l/${link.id}/complete`, payload: { razorpay_payment_id: payment.id } })).json<{ status: string; redirect: string }>();
    expect(result.status).toBe('paid');
    const url = new URL(result.redirect);
    expect(url.searchParams.get('src')).toBe('link');
    expect(verifyPaymentLinkSignature({
      paymentLinkId: url.searchParams.get('razorpay_payment_link_id') ?? '', referenceId: url.searchParams.get('razorpay_payment_link_reference_id'),
      status: url.searchParams.get('razorpay_payment_link_status') ?? '', paymentId: url.searchParams.get('razorpay_payment_id') ?? '', signature: url.searchParams.get('razorpay_signature') ?? '',
    }, TEST_KEY.keySecret)).toBe(true);
  });

  it('refuses payments from another order', async () => {
    const { app, engine } = await setup();
    const link = engine.createPaymentLink({ amount: 100 });
    const other = engine.createOrder({ amount: 100 });
    const payment = engine.attemptPayment({ orderId: other.id, method: 'upi', outcome: { kind: 'success' } });
    expect((await app.inject({ method: 'POST', url: `/l/${link.id}/complete`, payload: { razorpay_payment_id: payment.id } })).statusCode).toBe(400);
  });

  it('serves the page script', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/_localpay/checkout/plink.js' })).body).toContain("location.pathname + '/complete'");
  });
});

describe('subscription page', () => {
  it('renders the plan and opens checkout with subscription_id', async () => {
    const { app, engine } = await setup();
    const plan = engine.createPlan({ period: 'monthly', interval: 1, item: { name: 'Pro <plan>', amount: 49900 } });
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 12 });
    const body = (await app.inject({ url: `/s/${sub.id}` })).body;
    expect(body).toContain('Pro &lt;plan&gt;');
    expect(body).toContain('12 payments, every month');
    expect(body).toContain(`data-subscription="${sub.id}"`);
    expect(body).toContain('id="pay"');
    engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } });
    expect((await app.inject({ url: `/s/${sub.id}` })).body).toContain('This subscription is active.');
    expect((await app.inject({ url: '/s/sub_missing000000000' })).statusCode).toBe(404);
  });

  it('page script handles subscriptions', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/_localpay/checkout/plink.js' })).body).toContain('subscription_id: subscription');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});
