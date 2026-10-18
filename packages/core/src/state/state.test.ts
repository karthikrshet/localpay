import { describe, expect, it } from 'vitest';
import type { Order } from '../entities/index.ts';
import type { AnyEvent } from '../events/types.ts';
import { replay } from './index.ts';

const order = (status: Order['status'], amountPaid = 0): Order => ({
  id: 'order_AAAAAAAAAAAAAA', amount: 50000, amountPaid, currency: 'INR', receipt: null, notes: {},
  status, attempts: 0, partialPayment: false, autoCapture: null, createdAt: 1,
});

describe('replay', () => {
  it('keeps the latest snapshot of each entity', () => {
    const events: AnyEvent[] = [
      { seq: 1, id: 'evt_1', type: 'order.created', at: 1, data: { order: order('created') } },
      { seq: 2, id: 'evt_2', type: 'order.updated', at: 2, data: { order: order('attempted') } },
    ];
    const state = replay(events);
    expect(state.orders.size).toBe(1);
    expect(state.orders.get('order_AAAAAAAAAAAAAA')?.status).toBe('attempted');
  });

  it('ignores events without entities', () => {
    const state = replay([{ seq: 1, id: 'evt_1', type: 'clock.advanced', at: 1, data: { from: 0, to: 1 } }]);
    expect(state.orders.size + state.payments.size + state.refunds.size).toBe(0);
  });
});
