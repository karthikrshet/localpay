// HMAC-SHA256 signatures, hex encoded. Verification always compares in constant time,
// because people copy examples.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacHex(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/** Constant-time comparison of two hex signatures. */
export function signaturesMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout success: HMAC of `order_id|payment_id` with the key secret. */
export function checkoutSignature(orderId: string, paymentId: string, keySecret: string): string {
  return hmacHex(`${orderId}|${paymentId}`, keySecret);
}

export function verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }, keySecret: string): boolean {
  return signaturesMatch(checkoutSignature(input.orderId, input.paymentId, keySecret), input.signature);
}

/** Webhooks: HMAC of the raw request body with the webhook secret (X-Razorpay-Signature). */
export function webhookSignature(rawBody: string, webhookSecret: string): string {
  return hmacHex(rawBody, webhookSecret);
}

export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  return signaturesMatch(webhookSignature(rawBody, webhookSecret), signature);
}
