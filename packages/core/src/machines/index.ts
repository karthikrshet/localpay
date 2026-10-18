// Allowed status transitions per entity. The engine checks every change against
// these tables, so an impossible state cannot be reached by any API sequence.
import type { DisputeStatus, OrderStatus, PaymentLinkStatus, PaymentStatus, RefundStatus, SubscriptionStatus } from '../entities/index.ts';

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  created: ['attempted', 'paid'],
  attempted: ['paid'],
  paid: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ['authorized', 'failed'],
  // authorized → refunded: an uncaptured payment is released back to the customer.
  authorized: ['captured', 'failed', 'refunded'],
  captured: ['refunded'],
  // failed → authorized: "late authorization", when the bank confirms after a timeout.
  failed: ['authorized'],
  // refunded → captured: the only refund failed, so the money stays with the merchant.
  refunded: ['captured'],
};

export const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  pending: ['processed', 'failed'],
  processed: [],
  failed: [],
};

export const PAYMENT_LINK_TRANSITIONS: Record<PaymentLinkStatus, readonly PaymentLinkStatus[]> = {
  created: ['partially_paid', 'paid', 'expired', 'cancelled'],
  partially_paid: ['paid', 'expired', 'cancelled'],
  paid: [],
  expired: [],
  cancelled: [],
};

export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  created: ['authenticated', 'active', 'cancelled'],
  authenticated: ['active', 'pending', 'cancelled'],
  active: ['pending', 'completed', 'cancelled'],
  // pending: a renewal failed and is being retried.
  pending: ['active', 'halted', 'completed', 'cancelled'],
  // halted: retries ran out; a later successful charge reactivates it.
  halted: ['active', 'completed', 'cancelled'],
  cancelled: [],
  completed: [],
};

export const DISPUTE_TRANSITIONS: Record<DisputeStatus, readonly DisputeStatus[]> = {
  open: ['under_review', 'lost'],
  under_review: ['won', 'lost'],
  won: [],
  lost: [],
};

const TABLES = {
  order: ORDER_TRANSITIONS,
  payment: PAYMENT_TRANSITIONS,
  refund: REFUND_TRANSITIONS,
  paymentLink: PAYMENT_LINK_TRANSITIONS,
  subscription: SUBSCRIPTION_TRANSITIONS,
  dispute: DISPUTE_TRANSITIONS,
};
type Machine = keyof typeof TABLES;
type StatusOf<M extends Machine> = keyof (typeof TABLES)[M] & string;

export class InvalidTransitionError extends Error {
  readonly machine: Machine;
  readonly from: string;
  readonly to: string;
  constructor(machine: Machine, from: string, to: string) {
    super(`${machine} cannot move from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
    this.machine = machine;
    this.from = from;
    this.to = to;
  }
}

export function canTransition<M extends Machine>(machine: M, from: StatusOf<M>, to: StatusOf<M>): boolean {
  if (from === to) return true;
  const table = TABLES[machine] as Record<string, readonly string[]>;
  return table[from]?.includes(to) ?? false;
}

export function assertTransition<M extends Machine>(machine: M, from: StatusOf<M>, to: StatusOf<M>): void {
  if (!canTransition(machine, from, to)) throw new InvalidTransitionError(machine, from, to);
}
