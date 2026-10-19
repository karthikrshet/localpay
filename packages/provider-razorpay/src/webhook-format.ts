// Domain events → Razorpay webhook envelopes and signed headers.
import type { AnyEvent, WebhookFormat, WebhookMessage } from '@localpay/core';
import { toWirePaymentLink } from './payment-links/serializer.ts';
import { toWireDispute } from './routes/disputes.ts';
import { toWireSubscription } from './subscriptions/serializer.ts';
import { toWireOrder, toWirePayment, toWireRefund } from './serializers.ts';
import { webhookSignature } from './signatures.ts';

export const WEBHOOK_EVENTS = [
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'order.paid',
  'refund.created',
  'refund.processed',
  'refund.failed',
  'payment_link.paid',
  'payment_link.partially_paid',
  'payment_link.expired',
  'payment_link.cancelled',
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.pending',
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.updated',
  'payment.dispute.created',
  'payment.dispute.under_review',
  'payment.dispute.won',
  'payment.dispute.lost',
] as const;

export const SIGNATURE_HEADER = 'X-Razorpay-Signature';
export const EVENT_ID_HEADER = 'X-Razorpay-Event-Id';

type Payload = Record<string, { entity: unknown }>;

function envelope(event: AnyEvent, accountId: string, payload: Payload): WebhookMessage {
  return {
    name: event.type,
    payload: {
      entity: 'event',
      account_id: accountId,
      event: event.type,
      contains: Object.keys(payload),
      payload,
      created_at: Math.floor(event.at / 1000),
    },
  };
}

export function toWebhook(event: AnyEvent, accountId: string, baseUrl = 'http://127.0.0.1:4010'): WebhookMessage | null {
  switch (event.type) {
    case 'payment.authorized':
    case 'payment.captured':
    case 'payment.failed':
      return envelope(event, accountId, { payment: { entity: toWirePayment(event.data.payment) } });
    case 'order.paid':
      return envelope(event, accountId, {
        payment: { entity: toWirePayment(event.data.payment) },
        order: { entity: toWireOrder(event.data.order) },
      });
    case 'refund.created':
    case 'refund.processed':
    case 'refund.failed':
      return envelope(event, accountId, {
        refund: { entity: toWireRefund(event.data.refund) },
        payment: { entity: toWirePayment(event.data.payment) },
      });
    case 'payment_link.paid':
    case 'payment_link.partially_paid':
      return envelope(event, accountId, {
        payment_link: { entity: toWirePaymentLink(event.data.paymentLink, { baseUrl, payments: [event.data.payment] }) },
        payment: { entity: toWirePayment(event.data.payment) },
        order: { entity: toWireOrder(event.data.order) },
      });
    case 'payment_link.expired':
    case 'payment_link.cancelled':
      return envelope(event, accountId, { payment_link: { entity: toWirePaymentLink(event.data.paymentLink, { baseUrl, payments: [] }) } });
    case 'payment.dispute.created':
    case 'payment.dispute.under_review':
    case 'payment.dispute.won':
    case 'payment.dispute.lost':
      return envelope(event, accountId, {
        payment: { entity: toWirePayment(event.data.payment) },
        dispute: { entity: toWireDispute(event.data.dispute) },
      });
    case 'subscription.charged':
      return envelope(event, accountId, {
        subscription: { entity: toWireSubscription(event.data.subscription, baseUrl) },
        payment: { entity: toWirePayment(event.data.payment) },
      });
    case 'subscription.authenticated':
    case 'subscription.activated':
    case 'subscription.pending':
    case 'subscription.halted':
    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.updated':
      return envelope(event, accountId, { subscription: { entity: toWireSubscription(event.data.subscription, baseUrl) } });
    default:
      return null;
  }
}

/** `baseUrl` is read per event, so it can change once the server knows its port. */
export function razorpayWebhookFormat(accountId: string, baseUrl: () => string = () => 'http://127.0.0.1:4010'): WebhookFormat {
  return {
    events: WEBHOOK_EVENTS,
    format: (event) => toWebhook(event, accountId, baseUrl()),
    headers(rawBody, secret, eventId, options = {}) {
      return {
        'content-type': 'application/json',
        'user-agent': 'LocalPay-Webhooks/0.1 (+https://github.com/localpay/localpay)',
        [EVENT_ID_HEADER]: eventId,
        ...(options.signed === false ? {} : { [SIGNATURE_HEADER]: webhookSignature(rawBody, secret) }),
      };
    },
  };
}
