// The read model: current entities, built by folding events in order.
import type { Order, Payment, Refund } from '../entities/index.ts';
import type { AnyEvent } from '../events/types.ts';

export interface State {
  orders: Map<string, Order>;
  payments: Map<string, Payment>;
  refunds: Map<string, Refund>;
}

export function createState(): State {
  return { orders: new Map(), payments: new Map(), refunds: new Map() };
}

/** Upserts every entity snapshot the event carries. Insertion order = creation order. */
export function applyEvent(state: State, event: AnyEvent): void {
  const data = event.data;
  if ('order' in data) state.orders.set(data.order.id, data.order);
  if ('payment' in data) state.payments.set(data.payment.id, data.payment);
  if ('refund' in data) state.refunds.set(data.refund.id, data.refund);
}

/** Empties every collection in place, keeping references held elsewhere valid. */
export function clearState(state: State): void {
  for (const collection of Object.values(state) as Map<string, unknown>[]) collection.clear();
}

export function replay(events: Iterable<AnyEvent>): State {
  const state = createState();
  for (const event of events) applyEvent(state, event);
  return state;
}
