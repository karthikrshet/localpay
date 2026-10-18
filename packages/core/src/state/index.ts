// The read model: current entities, built by folding events in order.
import type { Customer, Dispute, Order, Payment, PaymentLink, Plan, Refund, Subscription } from '../entities/index.ts';
import type { AnyEvent } from '../events/types.ts';

export interface State {
  orders: Map<string, Order>;
  payments: Map<string, Payment>;
  refunds: Map<string, Refund>;
  customers: Map<string, Customer>;
  paymentLinks: Map<string, PaymentLink>;
  plans: Map<string, Plan>;
  subscriptions: Map<string, Subscription>;
  disputes: Map<string, Dispute>;
}

/** Event data key → state collection. Add a row when adding an entity. */
export const ENTITY_COLLECTIONS = {
  order: 'orders',
  payment: 'payments',
  refund: 'refunds',
  customer: 'customers',
  paymentLink: 'paymentLinks',
  plan: 'plans',
  subscription: 'subscriptions',
  dispute: 'disputes',
} as const satisfies Record<string, keyof State>;

export function createState(): State {
  return { orders: new Map(), payments: new Map(), refunds: new Map(), customers: new Map(), paymentLinks: new Map(), plans: new Map(), subscriptions: new Map(), disputes: new Map() };
}

const hasId = (value: unknown): value is { id: string } =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';

/** Upserts every entity snapshot the event carries. Insertion order = creation order. */
export function applyEvent(state: State, event: AnyEvent): void {
  const data = event.data as Record<string, unknown>;
  for (const [key, collection] of Object.entries(ENTITY_COLLECTIONS)) {
    const entity = data[key];
    if (hasId(entity)) (state[collection] as Map<string, unknown>).set(entity.id, entity);
  }
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
