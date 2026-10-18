// Domain events. Each event carries full snapshots of every entity it changed,
// so state is a plain fold over the log and webhooks need no extra lookups.
import type { Customer, Dispute, Order, Payment, PaymentLink, Plan, Refund, Subscription } from '../entities/index.ts';

export interface EventMap {
  'order.created': { order: Order };
  'order.updated': { order: Order };
  'order.paid': { order: Order; payment: Payment };
  'payment.authorized': { payment: Payment };
  'payment.captured': { payment: Payment };
  'payment.failed': { payment: Payment };
  'payment.updated': { payment: Payment };
  'refund.created': { refund: Refund; payment: Payment };
  'refund.processed': { refund: Refund; payment: Payment };
  'refund.failed': { refund: Refund; payment: Payment };
  'refund.updated': { refund: Refund };
  'customer.created': { customer: Customer };
  'customer.updated': { customer: Customer };
  'payment_link.created': { paymentLink: PaymentLink };
  'payment_link.updated': { paymentLink: PaymentLink };
  'payment_link.partially_paid': { paymentLink: PaymentLink; payment: Payment; order: Order };
  'payment_link.paid': { paymentLink: PaymentLink; payment: Payment; order: Order };
  'payment_link.expired': { paymentLink: PaymentLink };
  'payment_link.cancelled': { paymentLink: PaymentLink };
  'plan.created': { plan: Plan };
  'subscription.created': { subscription: Subscription };
  'subscription.authenticated': { subscription: Subscription };
  'subscription.activated': { subscription: Subscription };
  'subscription.charged': { subscription: Subscription; payment: Payment };
  'subscription.pending': { subscription: Subscription };
  'subscription.halted': { subscription: Subscription };
  'subscription.cancelled': { subscription: Subscription };
  'subscription.completed': { subscription: Subscription };
  'subscription.updated': { subscription: Subscription };
  'payment.dispute.created': { dispute: Dispute; payment: Payment };
  'payment.dispute.under_review': { dispute: Dispute; payment: Payment };
  'payment.dispute.won': { dispute: Dispute; payment: Payment };
  'payment.dispute.lost': { dispute: Dispute; payment: Payment };
  'payment.dispute.updated': { dispute: Dispute };
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
