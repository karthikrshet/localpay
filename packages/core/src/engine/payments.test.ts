import { describe, expect, it } from 'vitest';
import type { PaymentError } from '../entities/index.ts';
import { createEngineBase, type EngineOptions } from './base.ts';
import { createOrderOps } from './orders.ts';
import { createPaymentOps } from './payments.ts';

const setup = (options: EngineOptions = {}) => {
  const base = createEngineBase({ seed: 'payments', ...options });
  const orders = createOrderOps(base);
  return { base, orders, payments: createPaymentOps(base, orders) };
};

const DECLINED: PaymentError = { code: 'BAD_REQUEST_ERROR', description: 'declined', source: 'bank', step: 'payment_authorization', reason: 'payment_declined' };

describe('payment attempts', () => {
  it('auto-captures a successful payment and marks the order paid', () => {
    const { base, orders, payments } = setup();
    const order = orders.createOrder({ amount: 50000 });
    const payment = payments.attemptPayment({ orderId: order.id, method: 'upi', vpa: 'success@test', outcome: { kind: 'success' } });
    expect(payment).toMatchObject({ status: 'captured', captured: true, amount: 50000, method: 'upi', vpa: 'success@test', fee: 1180, tax: 180 });
    expect(orders.getOrder(order.id)).toMatchObject({ status: 'paid', amountPaid: 50000, attempts: 1 });
    expect(base.events.map((e) => e.type)).toEqual(['order.created', 'order.updated', 'payment.authorized', 'payment.captured', 'order.paid']);
  });

  it('stops at authorized when auto-capture is off', () => {
    const { orders, payments } = setup({ config: { autoCapture: false } });
    const order = orders.createOrder({ amount: 100 });
    const payment = payments.attemptPayment({ orderId: order.id, method: 'card', outcome: { kind: 'success' } });
    expect(payment).toMatchObject({ status: 'authorized', captured: false, fee: null });
    expect(payment.cardId).toMatch(/^card_/);
    expect(orders.getOrder(order.id).status).toBe('attempted');
  });

  it('honours the order-level auto-capture override and authorize_only', () => {
    const { orders, payments } = setup();
    const manual = orders.createOrder({ amount: 100, autoCapture: false });
    expect(payments.attemptPayment({ orderId: manual.id, method: 'upi', outcome: { kind: 'success' } }).status).toBe('authorized');
    const other = orders.createOrder({ amount: 100 });
    expect(payments.attemptPayment({ orderId: other.id, method: 'upi', outcome: { kind: 'authorize_only' } }).status).toBe('authorized');
  });

  it('records a failure and counts the attempt', () => {
    const { base, orders, payments } = setup();
    const order = orders.createOrder({ amount: 100 });
    const payment = payments.attemptPayment({ orderId: order.id, method: 'netbanking', bank: 'HDFC', outcome: { kind: 'fail', error: DECLINED } });
    expect(payment).toMatchObject({ status: 'failed', error: DECLINED, bank: 'HDFC' });
    expect(orders.getOrder(order.id)).toMatchObject({ status: 'attempted', attempts: 1 });
    expect(base.events.at(-1)?.type).toBe('payment.failed');
  });

  it('refuses payments on a paid order or above the amount due', () => {
    const { orders, payments } = setup();
    const order = orders.createOrder({ amount: 100 });
    expect(() => payments.attemptPayment({ orderId: order.id, method: 'upi', amount: 101, outcome: { kind: 'success' } })).toThrow(
      expect.objectContaining({ reason: 'amount_exceeds_amount_due' }) as Error,
    );
    expect(() => payments.attemptPayment({ orderId: order.id, method: 'upi', amount: 50, outcome: { kind: 'success' } })).toThrow(
      expect.objectContaining({ reason: 'partial_payment_not_allowed' }) as Error,
    );
    payments.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    expect(() => payments.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } })).toThrow(
      expect.objectContaining({ reason: 'order_already_paid' }) as Error,
    );
  });

  it('allows several partial payments when the order permits them', () => {
    const { orders, payments } = setup();
    const order = orders.createOrder({ amount: 1000, partialPayment: true });
    payments.attemptPayment({ orderId: order.id, method: 'upi', amount: 400, outcome: { kind: 'success' } });
    expect(orders.getOrder(order.id)).toMatchObject({ status: 'attempted', amountPaid: 400 });
    payments.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    expect(orders.getOrder(order.id)).toMatchObject({ status: 'paid', amountPaid: 1000, attempts: 2 });
  });

  it('lists payments newest first, optionally by order', () => {
    const { orders, payments } = setup();
    const a = orders.createOrder({ amount: 100 });
    const b = orders.createOrder({ amount: 100 });
    const p1 = payments.attemptPayment({ orderId: a.id, method: 'upi', outcome: { kind: 'fail', error: DECLINED } });
    const p2 = payments.attemptPayment({ orderId: b.id, method: 'upi', outcome: { kind: 'success' } });
    expect(payments.listPayments().map((p) => p.id)).toEqual([p2.id, p1.id]);
    expect(payments.listPayments({ orderId: a.id }).map((p) => p.id)).toEqual([p1.id]);
  });
});

describe('capture', () => {
  const authorized = () => {
    const env = setup({ config: { autoCapture: false } });
    const order = env.orders.createOrder({ amount: 50000 });
    const payment = env.payments.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    return { ...env, order, payment };
  };

  it('captures an authorized payment for the full amount', () => {
    const { orders, payments, order, payment } = authorized();
    const captured = payments.capturePayment(payment.id, { amount: 50000, currency: 'INR' });
    expect(captured).toMatchObject({ status: 'captured', captured: true, fee: 1180, tax: 180 });
    expect(orders.getOrder(order.id).status).toBe('paid');
  });

  it('rejects a mismatched amount or currency', () => {
    const { payments, payment } = authorized();
    expect(() => payments.capturePayment(payment.id, { amount: 100 })).toThrow(expect.objectContaining({ reason: 'capture_amount_mismatch', field: 'amount' }) as Error);
    expect(() => payments.capturePayment(payment.id, { amount: 50000, currency: 'USD' })).toThrow(expect.objectContaining({ reason: 'currency_mismatch' }) as Error);
  });

  it('rejects capturing twice or capturing a failed payment', () => {
    const { orders, payments, payment } = authorized();
    payments.capturePayment(payment.id, { amount: 50000 });
    expect(() => payments.capturePayment(payment.id, { amount: 50000 })).toThrow(expect.objectContaining({ reason: 'payment_already_captured' }) as Error);
    const order = orders.createOrder({ amount: 100 });
    const failed = payments.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'fail', error: DECLINED } });
    expect(() => payments.capturePayment(failed.id, { amount: 100 })).toThrow(expect.objectContaining({ reason: 'payment_not_authorized' }) as Error);
  });

  it('reports unknown payments', () => {
    const { payments } = setup();
    expect(() => payments.capturePayment('pay_missing00000000', { amount: 1 })).toThrow(expect.objectContaining({ reason: 'not_found' }) as Error);
  });
});
