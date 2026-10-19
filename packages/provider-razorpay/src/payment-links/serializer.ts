import type { Payment, PaymentLink } from '@localpay/core';
import { hmacHex, signaturesMatch } from '../signatures.ts';
import { trimTrailingSlashes, wireNotes } from '../serializers.ts';

/** Where a link's hosted page lives: <base>/l/<id>. */
export const shortUrl = (baseUrl: string, link: Pick<PaymentLink, 'id'>): string => `${trimTrailingSlashes(baseUrl)}/l/${link.id}`;

export function toWirePaymentLink(link: PaymentLink, context: { baseUrl: string; payments: Payment[] }) {
  return {
    id: link.id,
    entity: 'payment_link',
    amount: link.amount,
    amount_paid: link.amountPaid,
    currency: link.currency,
    accept_partial: link.acceptPartial,
    first_min_partial_amount: link.firstMinPartialAmount ?? 0,
    description: link.description ?? '',
    reference_id: link.referenceId ?? '',
    customer: link.customer,
    notify: link.notify,
    reminder_enable: link.reminderEnable,
    reminders: [],
    notes: wireNotes(link.notes),
    callback_url: link.callbackUrl ?? '',
    callback_method: link.callbackMethod ?? '',
    expire_by: link.expireBy ?? 0,
    expired_at: link.expiredAt ?? 0,
    cancelled_at: link.cancelledAt ?? 0,
    order_id: link.orderId,
    payments: context.payments.length
      ? context.payments.map((p) => ({ amount: p.amount, created_at: p.createdAt, method: p.method, payment_id: p.id, plink_id: link.id, status: p.status, updated_at: p.capturedAt ?? p.createdAt }))
      : null,
    short_url: shortUrl(context.baseUrl, link),
    status: link.status,
    upi_link: false,
    user_id: '',
    created_at: link.createdAt,
    updated_at: link.updatedAt,
  };
}

export interface LinkCallback {
  paymentLinkId: string;
  referenceId: string | null;
  status: string;
  paymentId: string;
}

/** Callback signature: HMAC of link_id|reference_id|status|payment_id with the key secret. */
export function paymentLinkSignature(input: LinkCallback, keySecret: string): string {
  return hmacHex(`${input.paymentLinkId}|${input.referenceId ?? ''}|${input.status}|${input.paymentId}`, keySecret);
}

export function verifyPaymentLinkSignature(input: LinkCallback & { signature: string }, keySecret: string): boolean {
  return signaturesMatch(paymentLinkSignature(input, keySecret), input.signature);
}

/** Query parameters added to callback_url after a payment. */
export function callbackParams(input: LinkCallback, keySecret: string): Record<string, string> {
  return {
    razorpay_payment_id: input.paymentId,
    razorpay_payment_link_id: input.paymentLinkId,
    razorpay_payment_link_reference_id: input.referenceId ?? '',
    razorpay_payment_link_status: input.status,
    razorpay_signature: paymentLinkSignature(input, keySecret),
  };
}
