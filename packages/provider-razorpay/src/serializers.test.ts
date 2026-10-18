import { createEngine } from '@localpay/core';
import { describe, expect, it } from 'vitest';
import { collection, paginate, toWireOrder, toWirePayment, toWireRefund, wireNotes } from './serializers.ts';

const flow = () => {
  const engine = createEngine({ seed: 'wire' });
  const order = engine.createOrder({ amount: 50000, receipt: 'r-1' });
  const payment = engine.attemptPayment({ orderId: order.id, method: 'upi', vpa: 'success@test', outcome: { kind: 'success' } });
  const refund = engine.createRefund(payment.id, { amount: 1000 });
  return { engine, order: engine.getOrder(order.id), payment: engine.getPayment(payment.id), refund };
};

describe('wire serializers', () => {
  it('renders an order with derived amount_due and snake_case fields', () => {
    const { order } = flow();
    expect(toWireOrder(order)).toEqual({
      id: order.id, entity: 'order', amount: 50000, amount_paid: 50000, amount_due: 0, currency: 'INR',
      receipt: 'r-1', offer_id: null, status: 'paid', attempts: 1, notes: [], created_at: order.createdAt,
    });
  });

  it('renders a payment with flattened error fields and fees', () => {
    const { payment } = flow();
    const wire = toWirePayment(payment);
    expect(wire).toMatchObject({
      entity: 'payment', status: 'captured', captured: true, method: 'upi', vpa: 'success@test',
      amount_refunded: 1000, refund_status: 'partial', fee: 1180, tax: 180, error_code: null, international: false,
    });
    expect(Object.keys(wire)).toContain('error_description');
  });

  it('renders a refund', () => {
    const { refund, payment } = flow();
    expect(toWireRefund(refund)).toMatchObject({ entity: 'refund', payment_id: payment.id, amount: 1000, status: 'pending', speed_requested: 'normal', speed_processed: null, batch_id: null });
  });

  it('renders empty notes as an empty array', () => {
    expect(wireNotes({})).toEqual([]);
    expect(wireNotes({ a: 1 })).toEqual({ a: 1 });
  });

  it('wraps lists in a collection', () => {
    expect(collection([1, 2])).toEqual({ entity: 'collection', count: 2, items: [1, 2] });
  });

  it('paginates by time window, skip and count', () => {
    const items = [5, 4, 3, 2, 1].map((createdAt) => ({ createdAt }));
    expect(paginate(items, { count: 2, skip: 1 })).toEqual([{ createdAt: 4 }, { createdAt: 3 }]);
    expect(paginate(items, { count: 10, skip: 0, from: 2, to: 4 }).map((i) => i.createdAt)).toEqual([4, 3, 2]);
  });
});
