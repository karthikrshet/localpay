// The subset of the checkout options contract LocalPay honours.

export type Method = 'upi' | 'card' | 'netbanking' | 'wallet';

export interface SuccessResponse {
  razorpay_payment_id: string;
  /** Set for order payments. */
  razorpay_order_id?: string;
  /** Set for subscription checkouts. */
  razorpay_subscription_id?: string;
  razorpay_signature: string;
}

export interface CheckoutError {
  code: string;
  description: string;
  source: string;
  step: string;
  reason: string;
  metadata: { payment_id?: string; order_id?: string; subscription_id?: string };
}

export interface FailureResponse {
  error: CheckoutError;
}

export interface CheckoutOptions {
  key: string;
  order_id?: string;
  /** Use instead of order_id to authenticate a subscription. */
  subscription_id?: string;
  amount?: number | string;
  currency?: string;
  name?: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string; method?: Method; vpa?: string };
  notes?: Record<string, string>;
  /** Accepted for compatibility; LocalPay keeps its own colours so it never looks official. */
  theme?: { color?: string };
  handler?: (response: SuccessResponse) => void;
  modal?: { ondismiss?: () => void; escape?: boolean; backdropclose?: boolean };
  callback_url?: string;
  redirect?: boolean;
}

export interface OrderDetails {
  id: string;
  amount: number;
  amount_due: number;
  currency: string;
  status: string;
}

export interface Scenario {
  id: string;
  label: string;
  effect: string;
}
