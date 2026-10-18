import { createEngine, type AnyEvent } from '@localpay/core';
import Razorpay from 'razorpay';
import { describe, expect, it } from 'vitest';
import { EVENT_ID_HEADER, razorpayWebhookFormat, SIGNATURE_HEADER, toWebhook } from './webhook-format.ts';

const ACCOUNT = 'acc_LocalPayDemo01';

const run = () => {
  const engine = createEngine({ seed: 'webhooks', config: { refundDelaySeconds: { normal: 0, optimum: 0 } } });
  const order = engine.createOrder({ amount: 50000 });
  const payment = engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
  engine.createRefund(payment.id, { amount: 100 });
  return engine.events;
};

describe('toWebhook', () => {
  it('turns the MVP domain events into webhooks and skips the rest', () => {
    const names = run().map((e) => toWebhook(e, ACCOUNT)?.name ?? null);
    expect(names).toEqual([null, null, 'payment.authorized', 'payment.captured', 'order.paid', 'refund.created', 'refund.processed']);
  });

  it('builds the event envelope with wire entities', () => {
    const captured = run().find((e) => e.type === 'payment.captured') as AnyEvent;
    expect(toWebhook(captured, ACCOUNT)?.payload).toMatchObject({
      entity: 'event',
      account_id: ACCOUNT,
      event: 'payment.captured',
      contains: ['payment'],
      payload: { payment: { entity: { entity: 'payment', status: 'captured', captured: true } } },
      created_at: Math.floor(captured.at / 1000),
    });
  });

  it('includes both order and payment in order.paid, and refund + payment in refund events', () => {
    const events = run();
    const paid = toWebhook(events.find((e) => e.type === 'order.paid') as AnyEvent, ACCOUNT)?.payload as { contains: string[] };
    expect(paid.contains).toEqual(['payment', 'order']);
    const refunded = toWebhook(events.find((e) => e.type === 'refund.processed') as AnyEvent, ACCOUNT)?.payload as { contains: string[] };
    expect(refunded.contains).toEqual(['refund', 'payment']);
  });
});

describe('payment link webhooks', () => {
  it('sends payment_link.paid with link, payment and order, and expiry with the link only', () => {
    const engine = createEngine({ seed: 'plink-hooks' });
    const paid = engine.createPaymentLink({ amount: 500 });
    engine.attemptPayment({ orderId: paid.orderId, method: 'upi', outcome: { kind: 'success' } });
    const expiring = engine.createPaymentLink({ amount: 500, expireBy: engine.now() + 1 });
    engine.advanceTime(1000);
    const byName = Object.fromEntries(engine.events.flatMap((e) => {
      const message = toWebhook(e, ACCOUNT, 'http://127.0.0.1:4010');
      return message ? [[message.name, message.payload]] : [];
    })) as Record<string, { contains: string[]; payload: { payment_link: { entity: { short_url: string; id: string } } } }>;
    expect(byName['payment_link.paid']?.contains).toEqual(['payment_link', 'payment', 'order']);
    expect(byName['payment_link.paid']?.payload.payment_link.entity.short_url).toBe(`http://127.0.0.1:4010/l/${paid.id}`);
    expect(byName['payment_link.expired']?.contains).toEqual(['payment_link']);
    expect(byName['payment_link.expired']?.payload.payment_link.entity.id).toBe(expiring.id);
  });
});

describe('subscription webhooks', () => {
  it('sends charged with subscription and payment, and status changes with the subscription', () => {
    const engine = createEngine({ seed: 'sub-hooks' });
    const plan = engine.createPlan({ period: 'monthly', interval: 1, item: { name: 'Pro', amount: 1000 } });
    const sub = engine.createSubscription({ planId: plan.id, totalCount: 1 });
    engine.authenticateSubscription(sub.id, { outcome: { kind: 'success' } });
    const messages = engine.events.flatMap((e) => {
      const m = toWebhook(e, ACCOUNT);
      return m ? [m] : [];
    });
    const names = messages.map((m) => m.name).filter((n) => n.startsWith('subscription.'));
    expect(names).toEqual(['subscription.authenticated', 'subscription.activated', 'subscription.charged', 'subscription.completed']);
    const charged = messages.find((m) => m.name === 'subscription.charged')?.payload as { contains: string[] };
    expect(charged.contains).toEqual(['subscription', 'payment']);
  });
});

describe('razorpayWebhookFormat headers', () => {
  it('signs the raw body so the official SDK accepts it', () => {
    const format = razorpayWebhookFormat(ACCOUNT);
    const body = '{"entity":"event"}';
    const headers = format.headers(body, 'whsec', 'evt_1');
    expect(headers[EVENT_ID_HEADER]).toBe('evt_1');
    expect(Razorpay.validateWebhookSignature(body, headers[SIGNATURE_HEADER] ?? '', 'whsec')).toBe(true);
  });

  it('can leave the signature out for failure injection', () => {
    expect(razorpayWebhookFormat(ACCOUNT).headers('{}', 's', 'e', { signed: false })).not.toHaveProperty(SIGNATURE_HEADER);
  });
});
