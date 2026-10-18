// Domain events. Each event carries full snapshots of every entity it changed,
// so state is a plain fold over the log and webhooks need no extra lookups.
import type { Order, Payment, Refund } from '../entities/index.ts';

export interface EventMap {
  'order.created': { order: Order };
  'order.updated': { order: Order };
  'order.paid': { order: Order; payment: Payment };
  'payment.authorized': { payment: Payment };
  'payment.captured': { payment: Payment };
  'payment.failed': { payment: Payment };
  'refund.created': { refund: Refund; payment: Payment };
  'refund.processed': { refund: Refund; payment: Payment };
  'refund.failed': { refund: Refund; payment: Payment };
  'clock.advanced': { from: number; to: number };
}

export type EventType = keyof EventMap;

export interface LocalPayEvent<K extends EventType = EventType> {
  /** 1-based position in the log. */
  seq: number;
  /** Stable event id, used for webhook de-duplication. */
  id: string;
  type: K;
  /** Emulator time in milliseconds when the event was recorded. */
  at: number;
  data: EventMap[K];
}

/** Union of every concrete event, so `switch (event.type)` narrows `data`. */
export type AnyEvent = { [K in EventType]: LocalPayEvent<K> }[EventType];
