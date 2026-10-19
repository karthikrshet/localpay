// Domain entities → Razorpay wire JSON. The only place that knows field names
// like amount_due or error_description.
import type { Notes, Order, Payment, Refund } from '@localpay/core';
import type { ListQuery } from './schemas.ts';

/** The gateway returns an empty JSON array, not an object, when there are no notes. */
/** Drops trailing slashes in one pass. A `/\/+$/` regex is quadratic on long runs of slashes. */
export function trimTrailingSlashes(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 47) end--;
  return text.slice(0, end);
}

export const wireNotes = (notes: Notes): Notes | [] => (Object.keys(notes).length === 0 ? [] : notes);

export function toWireOrder(order: Order) {
  return {
    id: order.id,
    entity: 'order',
    amount: order.amount,
    amount_paid: order.amountPaid,
    amount_due: order.amount - order.amountPaid,
    currency: order.currency,
    receipt: order.receipt,
    offer_id: null,
    status: order.status,
    attempts: order.attempts,
    notes: wireNotes(order.notes),
    created_at: order.createdAt,
  };
}

export function toWirePayment(payment: Payment) {
  return {
    id: payment.id,
    entity: 'payment',
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    order_id: payment.orderId,
    invoice_id: null,
    international: false,
    method: payment.method,
    amount_refunded: payment.amountRefunded,
    refund_status: payment.refundStatus,
    captured: payment.captured,
    description: payment.description,
    card_id: payment.cardId,
    bank: payment.bank,
    wallet: payment.wallet,
    vpa: payment.vpa,
    email: payment.email,
    contact: payment.contact,
    notes: wireNotes(payment.notes),
    fee: payment.fee,
    tax: payment.tax,
    error_code: payment.error?.code ?? null,
    error_description: payment.error?.description ?? null,
    error_source: payment.error?.source ?? null,
    error_step: payment.error?.step ?? null,
    error_reason: payment.error?.reason ?? null,
    acquirer_data: payment.method === 'upi' ? { rrn: null } : {},
    created_at: payment.createdAt,
  };
}

export function toWireRefund(refund: Refund) {
  return {
    id: refund.id,
    entity: 'refund',
    amount: refund.amount,
    currency: refund.currency,
    payment_id: refund.paymentId,
    notes: wireNotes(refund.notes),
    receipt: refund.receipt,
    acquirer_data: { arn: null },
    created_at: refund.createdAt,
    batch_id: null,
    status: refund.status,
    speed_processed: refund.speedProcessed,
    speed_requested: refund.speedRequested,
  };
}

export interface Collection<T> {
  entity: 'collection';
  count: number;
  items: T[];
}

export function collection<T>(items: T[]): Collection<T> {
  return { entity: 'collection', count: items.length, items };
}

/** Applies from/to (inclusive, Unix seconds), then skip and count, to a newest-first list. */
export function paginate<T extends { createdAt: number }>(items: T[], query: ListQuery): T[] {
  return items
    .filter((item) => (query.from === undefined || item.createdAt >= query.from) && (query.to === undefined || item.createdAt <= query.to))
    .slice(query.skip, query.skip + query.count);
}
