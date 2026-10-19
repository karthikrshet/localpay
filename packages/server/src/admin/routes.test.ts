import { createEngine, createManualClock, createRandom } from '@localpay/core';
import { razorpayWebhookFormat } from '@localpay/provider-razorpay';
import { createDispatcher, type WebhookTarget } from '@localpay/webhooks';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createAdminAuth, CSRF_HEADER } from './auth.ts';
import { adminApi, entityIds } from './routes.ts';

const setup = async () => {
  const clock = createManualClock(Date.UTC(2026, 0, 1));
  const engine = createEngine({ seed: 'admin', clock, config: { refundDelaySeconds: { normal: 60, optimum: 60 } } });
  const targets: WebhookTarget[] = [{ id: 'wh_1', url: 'http://localhost:9/hook', secret: 's' }];
  const sent: string[] = [];
  const dispatcher = createDispatcher({
    format: razorpayWebhookFormat('acc_X'), targets: () => targets, clock, random: createRandom(1), newId: (p) => engine.newId(p),
    send: (r) => { sent.push(r.body); return Promise.resolve({ statusCode: 200, responseBody: '', latencyMs: 1 }); },
  });
  engine.subscribe((e) => dispatcher.enqueue(e));
  const auth = createAdminAuth(null, 'admintoken');
  const app = Fastify();
  await app.register(adminApi, { prefix: '/_localpay/api', engine, dispatcher, webhookTargets: targets, auth, accountId: 'acc_X', keys: [{ keyId: 'rzp_test_A', keySecret: 'B' }] });
  const call = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
    const r = await app.inject({ method, url: `/_localpay/api${url}`, headers: { authorization: 'Bearer admintoken' }, ...(payload !== undefined && { payload: payload as object }) });
    return { status: r.statusCode, body: r.json<Record<string, unknown>>() };
  };
  const order = engine.createOrder({ amount: 50000, receipt: 'find-me' });
  const payment = engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
  return { app, engine, dispatcher, targets, sent, call, auth, order, payment };
};

describe('admin API', () => {
  it('requires the session token, and CSRF for cookie mutations', async () => {
    const { app, auth } = await setup();
    expect((await app.inject({ url: '/_localpay/api/session' })).statusCode).toBe(401);
    const cookie = 'lp_session=admintoken';
    expect((await app.inject({ url: '/_localpay/api/session', headers: { cookie } })).json()).toMatchObject({ csrf: auth.csrf, accountId: 'acc_X' });
    expect((await app.inject({ method: 'POST', url: '/_localpay/api/reset', headers: { cookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/_localpay/api/reset', headers: { cookie, [CSRF_HEADER]: auth.csrf } })).statusCode).toBe(200);
  });

  it('searches orders and shows an order with its payments and timeline', async () => {
    const { call, order } = await setup();
    expect(((await call('GET', '/orders?q=find-me')).body.items as unknown[]).length).toBe(1);
    expect(((await call('GET', '/orders?q=nothing')).body.items as unknown[]).length).toBe(0);
    const detail = (await call('GET', `/orders/${order.id}`)).body;
    expect(detail.order).toMatchObject({ id: order.id, status: 'paid' });
    expect((detail.payments as unknown[]).length).toBe(1);
    expect((detail.events as { type: string }[]).map((e) => e.type)).toEqual(['order.created', 'order.updated', 'payment.authorized', 'payment.captured', 'order.paid']);
  });

  it('shows a payment, and controls refunds by hand', async () => {
    const { call, engine, payment } = await setup();
    const refund = engine.createRefund(payment.id);
    expect((await call('GET', `/payments/${payment.id}`)).body).toMatchObject({ payment: { id: payment.id }, refunds: [{ id: refund.id, status: 'pending' }] });
    expect((await call('POST', `/refunds/${refund.id}/fail`)).body).toMatchObject({ refund: { status: 'failed' } });
    expect((await call('POST', `/refunds/${refund.id}/process`)).status).toBe(400);
  });

  it('authorizes a failed payment late, as the bank would', async () => {
    const { call, engine } = await setup();
    const order = engine.createOrder({ amount: 700 });
    const failed = engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'fail', error: { code: 'BAD_REQUEST_ERROR', description: 'x', source: 'customer', step: 'payment_authentication', reason: 'payment_timeout' } } });
    expect((await call('POST', `/payments/${failed.id}/late-authorize`)).body).toMatchObject({ payment: { status: 'captured' } });
  });

  it('raises, contests and resolves disputes as the bank would', async () => {
    const { call, payment } = await setup();
    const raised = await call('POST', `/payments/${payment.id}/dispute`, { reason_code: 'fraud', respond_in_days: 3 });
    const id = (raised.body.dispute as { id: string }).id;
    expect(raised.body.dispute).toMatchObject({ status: 'open', reason_code: 'fraud' });
    expect((await call('GET', `/payments/${payment.id}`)).body).toMatchObject({ disputes: [{ id }] });
    expect((await call('POST', `/disputes/${id}/resolve`, { outcome: 'won' })).status).toBe(400);
    expect((await call('POST', `/disputes/${id}/submit`)).body).toMatchObject({ dispute: { status: 'under_review' } });
    expect((await call('POST', `/disputes/${id}/resolve`, { outcome: 'won' })).body).toMatchObject({ dispute: { status: 'won' } });
  });

  it('lists, replays and double-sends webhook deliveries', async () => {
    const { call, dispatcher, sent } = await setup();
    await dispatcher.tick();
    const deliveries = (await call('GET', '/webhooks/deliveries')).body.items as { id: string }[];
    expect(deliveries).toHaveLength(3);
    const id = deliveries[0]?.id ?? '';
    expect(((await call('POST', `/webhooks/deliveries/${id}/send-twice`)).body.items as unknown[]).length).toBe(2);
    await call('POST', `/webhooks/deliveries/${id}/replay-unsigned`);
    await dispatcher.tick();
    expect(sent).toHaveLength(6);
    expect((await call('POST', '/webhooks/deliveries/whd_missing/replay')).status).toBe(404);
  });

  it('edits targets with SSRF checks, and fault settings with limits', async () => {
    const { call, targets } = await setup();
    expect((await call('PUT', '/webhooks/targets', [{ url: 'http://169.254.169.254/', secret: 's' }])).status).toBe(400);
    expect((await call('PUT', '/webhooks/targets', [{ url: 'http://localhost:3000/hook', secret: 's2', events: ['payment.failed'] }])).status).toBe(200);
    expect(targets).toEqual([{ id: 'wh_1', url: 'http://localhost:3000/hook', secret: 's2', events: ['payment.failed'], enabled: true }]);
    expect((await call('PUT', '/webhooks/faults', { duplicateRate: 0.5 })).body).toMatchObject({ duplicateRate: 0.5 });
    expect((await call('PUT', '/webhooks/faults', { duplicateRate: 3 })).status).toBe(400);
  });

  it('fast-forwards time and processes due refunds', async () => {
    const { call, engine, payment } = await setup();
    const refund = engine.createRefund(payment.id);
    const before = (await call('GET', '/time')).body.now as number;
    expect((await call('POST', '/time/advance', { duration: '1h' })).body).toMatchObject({ now: before + 3600, processed: 1 });
    expect(engine.getRefund(refund.id).status).toBe('processed');
    expect((await call('POST', '/time/advance', { duration: 'soon' })).status).toBe(400);
  });

  it('lists customers, payment links, subscriptions and settlements', async () => {
    const { call, engine } = await setup();
    engine.createCustomer({ name: 'Asha' });
    const link = engine.createPaymentLink({ amount: 1000 });
    const plan = engine.createPlan({ period: 'monthly', interval: 1, item: { name: 'Pro', amount: 1000 } });
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 2 });
    engine.advanceTime(3 * 86_400_000);
    expect((await call('GET', '/customers')).body).toMatchObject({ items: [{ name: 'Asha' }] });
    expect((await call('GET', '/payment-links')).body).toMatchObject({ items: [{ id: link.id, status: 'created' }] });
    expect((await call('POST', `/payment-links/${link.id}/cancel`)).body).toMatchObject({ link: { status: 'cancelled' } });
    expect((await call('GET', '/subscriptions')).body).toMatchObject({ plans: [{ id: plan.id }], items: [{ id: sub.id, status: 'created' }] });
    expect((await call('POST', `/subscriptions/${sub.id}/cancel`)).body).toMatchObject({ subscription: { status: 'cancelled' } });
    expect((await call('GET', '/settlements')).body).toMatchObject({ items: [{ entity: 'settlement', status: 'processed' }] });
  });

  it('exports the event log as a JSONL recording', async () => {
    const { app } = await setup();
    const response = await app.inject({ url: '/_localpay/api/events.jsonl', headers: { authorization: 'Bearer admintoken' } });
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    const lines = response.body.trim().split('\n').map((l) => JSON.parse(l) as { seq: number });
    expect(lines.map((l) => l.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns the event log after a sequence number', async () => {
    const { call } = await setup();
    expect(((await call('GET', '/events?after=3')).body.events as { seq: number }[]).map((e) => e.seq)).toEqual([4, 5]);
  });
});

describe('entityIds', () => {
  it('collects ids and parent ids from an event', async () => {
    const { engine, payment, order } = await setup();
    const captured = engine.events.find((e) => e.type === 'payment.captured');
    expect(captured && entityIds(captured)).toEqual([payment.id, order.id]);
  });
});
