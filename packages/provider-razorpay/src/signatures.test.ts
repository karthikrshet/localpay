import { createHmac } from 'node:crypto';
import Razorpay from 'razorpay';
import { describe, expect, it } from 'vitest';
import { checkoutSignature, signaturesMatch, verifyCheckoutSignature, verifyWebhookSignature, webhookSignature } from './signatures.ts';

describe('signatures', () => {
  it('signs checkout results as HMAC-SHA256(order_id|payment_id)', () => {
    const expected = createHmac('sha256', 'secret').update('order_A|pay_B').digest('hex');
    expect(checkoutSignature('order_A', 'pay_B', 'secret')).toBe(expected);
    expect(verifyCheckoutSignature({ orderId: 'order_A', paymentId: 'pay_B', signature: expected }, 'secret')).toBe(true);
    expect(verifyCheckoutSignature({ orderId: 'order_A', paymentId: 'pay_C', signature: expected }, 'secret')).toBe(false);
  });

  it('signs webhooks over the raw body', () => {
    const body = '{"entity":"event","event":"payment.captured"}';
    const signature = webhookSignature(body, 'whsec');
    expect(verifyWebhookSignature(body, signature, 'whsec')).toBe(true);
    expect(verifyWebhookSignature(`${body} `, signature, 'whsec')).toBe(false);
  });

  it('agrees with the official SDK helper', () => {
    const body = '{"a":1}';
    expect(Razorpay.validateWebhookSignature(body, webhookSignature(body, 'whsec'), 'whsec')).toBe(true);
  });

  it('compares different lengths safely', () => {
    expect(signaturesMatch('abc', 'abcd')).toBe(false);
  });
});
