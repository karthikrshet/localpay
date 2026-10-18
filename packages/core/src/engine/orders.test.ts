import { describe, expect, it } from 'vitest';
import { createEngineBase } from './base.ts';
import { EngineError } from './errors.ts';
import { amountDue, createOrderOps } from './orders.ts';

const setup = () => {
  const base = createEngineBase({ seed: 'orders' });
  return { base, orders: createOrderOps(base) };
};

describe('order operations', () => {
  it('creates an order in created status and emits order.created', () => {
    const { base, orders } = setup();
    const order = orders.createOrder({ amount: 50000, receipt: 'r-1', notes: { sku: 'A1' } });
    expect(order).toMatchObject({ amount: 50000, amountPaid: 0, currency: 'INR', receipt: 'r-1', status: 'created', attempts: 0 });
    expect(order.id).toMatch(/^order_/);
    expect(order.createdAt).toBe(base.now());
    expect(base.events.map((e) => e.type)).toEqual(['order.created']);
    expect(amountDue(order)).toBe(50000);
  });

  it.each([0, -5, 10.5, Number.NaN])('rejects amount %s', (amount) => {
    const { orders } = setup();
    expect(() => orders.createOrder({ amount })).toThrow(EngineError);
  });

  it('rejects malformed currencies', () => {
    const { orders } = setup();
    expect(() => orders.createOrder({ amount: 100, currency: 'inr' })).toThrow(/3-letter/);
  });

  it('fetches, lists newest first and reports missing ids', () => {
    const { orders } = setup();
    const a = orders.createOrder({ amount: 100 });
    const b = orders.createOrder({ amount: 200 });
    expect(orders.getOrder(a.id)).toEqual(a);
    expect(orders.listOrders().map((o) => o.id)).toEqual([b.id, a.id]);
    expect(() => orders.getOrder('order_missing0000000')).toThrow(expect.objectContaining({ reason: 'not_found' }) as Error);
  });

  it('updates notes through an event', () => {
    const { base, orders } = setup();
    const order = orders.createOrder({ amount: 100 });
    expect(orders.updateOrderNotes(order.id, { ref: 'x' }).notes).toEqual({ ref: 'x' });
    expect(base.events.at(-1)?.type).toBe('order.updated');
  });
});
