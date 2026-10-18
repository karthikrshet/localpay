// What the fake customer can do in the checkout popup, and the magic test values
// that force an outcome no matter which button is pressed.
import type { PaymentError, PaymentMethod, PaymentOutcome } from '@localpay/core';

export interface CheckoutScenario {
  id: string;
  label: string;
  /** One line under the button: what the merchant's app will see. */
  effect: string;
  outcome: PaymentOutcome;
}

const failure = (error: PaymentError): PaymentOutcome => ({ kind: 'fail', error });

export const CHECKOUT_SCENARIOS: readonly CheckoutScenario[] = [
  {
    id: 'success',
    label: 'Pay successfully',
    effect: 'Authorizes the payment; with auto-capture, fires payment.captured and order.paid.',
    outcome: { kind: 'success' },
  },
  {
    id: 'insufficient_funds',
    label: 'Fail: insufficient funds',
    effect: 'Fires payment.failed with BAD_REQUEST_ERROR (insufficient_funds).',
    outcome: failure({
      code: 'BAD_REQUEST_ERROR',
      description: 'Payment failed because the account does not have enough balance.',
      source: 'customer',
      step: 'payment_authorization',
      reason: 'insufficient_funds',
    }),
  },
  {
    id: 'bank_down',
    label: 'Fail: bank down',
    effect: 'Fires payment.failed with GATEWAY_ERROR (bank_technical_error).',
    outcome: failure({
      code: 'GATEWAY_ERROR',
      description: 'Payment failed because the bank is having technical issues.',
      source: 'bank',
      step: 'payment_authorization',
      reason: 'bank_technical_error',
    }),
  },
  {
    id: 'upi_timeout',
    label: 'UPI timeout',
    effect: 'Fires payment.failed with reason payment_timeout, as when a UPI request expires.',
    outcome: failure({
      code: 'BAD_REQUEST_ERROR',
      description: 'Payment was not completed in time.',
      source: 'customer',
      step: 'payment_authentication',
      reason: 'payment_timeout',
    }),
  },
  {
    id: 'authorize_only',
    label: 'Authorize only (no capture)',
    effect: 'Fires payment.authorized only. Your server must capture it.',
    outcome: { kind: 'authorize_only' },
  },
];

export const BANK_TIMEOUT: CheckoutScenario = {
  id: 'bank_timeout',
  label: 'Bank timeout (magic amount)',
  effect: 'Fires payment.failed with GATEWAY_ERROR (bank_timeout).',
  outcome: failure({
    code: 'GATEWAY_ERROR',
    description: 'Payment failed because the bank did not respond in time.',
    source: 'bank',
    step: 'payment_authorization',
    reason: 'bank_timeout',
  }),
};

/** Magic values, documented in one table in the docs. Real test-mode values first. */
export const MAGIC_VALUES = [
  { kind: 'vpa', value: 'success@razorpay', scenario: 'success', origin: 'Razorpay test mode' },
  { kind: 'vpa', value: 'failure@razorpay', scenario: 'insufficient_funds', origin: 'Razorpay test mode' },
  { kind: 'amount', value: 'paise ending in 13 (e.g. ₹100.13)', scenario: 'bank_timeout', origin: 'LocalPay only' },
] as const;

export function findScenario(id: string): CheckoutScenario | undefined {
  return id === BANK_TIMEOUT.id ? BANK_TIMEOUT : CHECKOUT_SCENARIOS.find((s) => s.id === id);
}

/** Applies magic values: they win over the button the user pressed. */
export function resolveScenario(chosen: string, input: { amount: number; method: PaymentMethod; vpa?: string | null }): CheckoutScenario | undefined {
  if (input.amount % 100 === 13) return BANK_TIMEOUT;
  if (input.method === 'upi' && input.vpa === 'failure@razorpay') return findScenario('insufficient_funds');
  if (input.method === 'upi' && input.vpa === 'success@razorpay') return findScenario('success');
  return findScenario(chosen);
}
