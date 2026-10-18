// Domain events → Razorpay webhook envelopes and signed headers.
import type { AnyEvent, WebhookFormat, WebhookMessage } from '@localpay/core';
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

export function toWebhook(event: AnyEvent, accountId: string): WebhookMessage | null {
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
    default:
      return null;
  }
}

export function razorpayWebhookFormat(accountId: string): WebhookFormat {
  return {
    events: WEBHOOK_EVENTS,
    format: (event) => toWebhook(event, accountId),
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
