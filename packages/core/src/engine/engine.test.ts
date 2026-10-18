import { describe, expect, it } from 'vitest';
import { createManualClock, createOffsetClock } from '../clock/index.ts';
import { createMemoryEventStore } from '../events/store.ts';
import { createEngine } from './index.ts';

describe('createEngine', () => {
  it('runs a full order → payment → refund flow through one event log', () => {
    const engine = createEngine({ seed: 'flow' });
    const order = engine.createOrder({ amount: 50000 });
    const payment = engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    const refund = engine.createRefund(payment.id, { amount: 10000 });
    expect(engine.events.map((e) => e.type)).toEqual([
      'order.created', 'order.updated', 'payment.authorized', 'payment.captured', 'order.paid', 'refund.created',
    ]);
    expect(engine.getRefund(refund.id).status).toBe('pending');
  });

  it('advanceTime() moves the clock, logs it and processes due refunds', () => {
    const engine = createEngine({ seed: 'time' });
    const order = engine.createOrder({ amount: 100 });
    const payment = engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    const refund = engine.createRefund(payment.id);
    expect(engine.advanceTime(60_000)).toBe(1);
    expect(engine.getRefund(refund.id).status).toBe('processed');
    expect(engine.events.map((e) => e.type)).toContain('clock.advanced');
  });

  it('refuses to time travel on the system clock', () => {
    expect(() => createEngine().advanceTime(1000)).toThrow(expect.objectContaining({ reason: 'time_not_controllable' }) as Error);
    expect(() => createEngine({ clock: createOffsetClock() }).advanceTime(1000)).not.toThrow();
  });

  it('is fully reproducible for the same seed', () => {
    const run = () => {
      const engine = createEngine({ seed: 42 });
      const order = engine.createOrder({ amount: 777 });
      engine.attemptPayment({ orderId: order.id, method: 'card', outcome: { kind: 'success' } });
      return engine.events;
    };
    expect(run()).toEqual(run());
  });

  it('restores state from a persisted log', () => {
    const store = createMemoryEventStore();
    const clock = createManualClock(Date.UTC(2026, 0, 1));
    const first = createEngine({ store, clock });
    const order = first.createOrder({ amount: 100 });
    first.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
    const second = createEngine({ store, clock });
    expect(second.getOrder(order.id).status).toBe('paid');
    expect(second.listPayments()).toHaveLength(1);
  });
});
