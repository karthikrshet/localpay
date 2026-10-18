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
