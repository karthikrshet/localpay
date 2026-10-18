import { describe, expect, it } from 'vitest';
import { createManualClock } from '../clock/index.ts';
import { createEngineBase } from './base.ts';
import type { EngineConfig } from './context.ts';
import { createOrderOps } from './orders.ts';
import { createPaymentOps } from './payments.ts';
import { createRefundOps } from './refunds.ts';

const setup = (config: Partial<EngineConfig> = {}) => {
  const clock = createManualClock(Date.UTC(2026, 0, 1));
  const base = createEngineBase({ seed: 'refunds', clock, config });
  const orders = createOrderOps(base);
  const payments = createPaymentOps(base, orders);
  const refunds = createRefundOps(base, payments);
  const order = orders.createOrder({ amount: 50000 });
  const payment = payments.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
  return { base, clock, payments, refunds, payment };
};

describe('refunds', () => {
  it('creates a pending full refund and marks the payment refunded', () => {
    const { base, payments, refunds, payment } = setup();
    const refund = refunds.createRefund(payment.id);
    expect(refund).toMatchObject({ amount: 50000, status: 'pending', speedRequested: 'normal', speedProcessed: null });
    expect(payments.getPayment(payment.id)).toMatchObject({ status: 'refunded', amountRefunded: 50000, refundStatus: 'full' });
    expect(base.events.at(-1)?.type).toBe('refund.created');
  });

  it('allows partial refunds up to the captured amount', () => {
    const { payments, refunds, payment } = setup();
    refunds.createRefund(payment.id, { amount: 20000 });
    expect(payments.getPayment(payment.id)).toMatchObject({ status: 'captured', amountRefunded: 20000, refundStatus: 'partial' });
    expect(() => refunds.createRefund(payment.id, { amount: 30001 })).toThrow(expect.objectContaining({ reason: 'refund_exceeds_payment' }) as Error);
    refunds.createRefund(payment.id, { amount: 30000 });
    expect(() => refunds.createRefund(payment.id, { amount: 1 })).toThrow(expect.objectContaining({ reason: 'payment_fully_refunded' }) as Error);
  });

  it('refuses refunds of payments that were never captured', () => {
    const { refunds } = setup();
    const env = setup({ autoCapture: false });
    expect(() => env.refunds.createRefund(env.payment.id)).toThrow(expect.objectContaining({ reason: 'payment_not_captured' }) as Error);
    expect(() => refunds.createRefund('pay_missing00000000')).toThrow(expect.objectContaining({ reason: 'not_found' }) as Error);
  });

  it('processes pending refunds when their time comes', () => {
    const { clock, refunds, payment } = setup();
    const refund = refunds.createRefund(payment.id, { speed: 'normal' });
    expect(refunds.processDueRefunds()).toBe(0);
    clock.advance(5_000);
    expect(refunds.processDueRefunds()).toBe(1);
    expect(refunds.getRefund(refund.id)).toMatchObject({ status: 'processed', speedProcessed: 'normal' });
  });

  it('processes instantly when the delay is zero, reporting optimum as instant', () => {
    const { refunds, payment } = setup({ refundDelaySeconds: { normal: 0, optimum: 0 } });
    expect(refunds.createRefund(payment.id, { speed: 'optimum' })).toMatchObject({ status: 'processed', speedProcessed: 'instant' });
  });

  it('failing a refund returns the amount to the payment', () => {
    const { payments, refunds, payment } = setup();
    const refund = refunds.createRefund(payment.id);
    expect(refunds.failRefund(refund.id).status).toBe('failed');
    expect(payments.getPayment(payment.id)).toMatchObject({ status: 'captured', amountRefunded: 0, refundStatus: null });
    expect(() => refunds.processRefund(refund.id)).toThrow(expect.objectContaining({ reason: 'refund_not_pending' }) as Error);
  });

  it('lists refunds newest first, optionally by payment', () => {
    const { refunds, payment } = setup();
    const a = refunds.createRefund(payment.id, { amount: 100 });
    const b = refunds.createRefund(payment.id, { amount: 100 });
    expect(refunds.listRefunds().map((r) => r.id)).toEqual([b.id, a.id]);
    expect(refunds.listRefunds({ paymentId: 'pay_other000000000' })).toEqual([]);
  });
});
