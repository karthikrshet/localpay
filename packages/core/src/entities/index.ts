// Domain entities. These are LocalPay's own shapes (camelCase, internal fields allowed);
// provider packages map them to a gateway's wire format.

/** Free-form key-value pairs attached by the merchant. */
export type Notes = Record<string, string | number>;

/** Integer amount in the currency's smallest unit (paise for INR). */
export type Paise = number;

/** Unix time in seconds, the unit every entity timestamp uses. */
export type UnixSeconds = number;

export type OrderStatus = 'created' | 'attempted' | 'paid';

export interface Order {
  id: string;
  amount: Paise;
  amountPaid: Paise;
  currency: string;
  receipt: string | null;
  notes: Notes;
  status: OrderStatus;
  attempts: number;
  partialPayment: boolean;
  /** Overrides the engine's auto-capture default for this order's payments. */
  autoCapture: boolean | null;
  createdAt: UnixSeconds;
}

export type PaymentStatus = 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';
export type RefundState = 'partial' | 'full';

export interface PaymentError {
  code: string;
  description: string;
  source: string;
  step: string;
  reason: string;
}

export interface Payment {
  id: string;
  orderId: string | null;
  amount: Paise;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  captured: boolean;
  description: string | null;
  email: string | null;
  contact: string | null;
  /** Method details: bank code, wallet name, UPI VPA or card id. */
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  cardId: string | null;
  amountRefunded: Paise;
  refundStatus: RefundState | null;
  /** Gateway fee including tax; set on capture. */
  fee: Paise | null;
  tax: Paise | null;
  error: PaymentError | null;
  notes: Notes;
  createdAt: UnixSeconds;
  authorizedAt: UnixSeconds | null;
  capturedAt: UnixSeconds | null;
}

export type RefundStatus = 'pending' | 'processed' | 'failed';
export type RefundSpeed = 'normal' | 'optimum';
export type RefundSpeedProcessed = 'normal' | 'instant';

export interface Refund {
  id: string;
  paymentId: string;
  amount: Paise;
  currency: string;
  status: RefundStatus;
  speedRequested: RefundSpeed;
  speedProcessed: RefundSpeedProcessed | null;
  notes: Notes;
  receipt: string | null;
  createdAt: UnixSeconds;
  /** Internal: when the engine will move a pending refund to processed. */
  processAt: UnixSeconds;
  processedAt: UnixSeconds | null;
}
