// Shapes returned by the dashboard API (wire JSON for entities).

export interface WireOrder {
  id: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: string;
  attempts: number;
  notes: Record<string, unknown> | [];
  created_at: number;
  payments?: number;
}

export interface WirePayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string | null;
  method: string;
  captured: boolean;
  amount_refunded: number;
  refund_status: string | null;
  fee: number | null;
  tax: number | null;
  email: string | null;
  contact: string | null;
  error_code: string | null;
  error_description: string | null;
  error_reason: string | null;
  created_at: number;
}

export interface WireRefund {
  id: string;
  amount: number;
  currency: string;
  payment_id: string;
  status: string;
  speed_requested: string;
  speed_processed: string | null;
  created_at: number;
}

export interface WireDispute {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  amount_deducted: number;
  reason_code: string;
  respond_by: number;
  status: string;
}

export interface LocalPayEvent {
  seq: number;
  id: string;
  type: string;
  at: number;
  data: Record<string, unknown>;
}

export interface DeliveryAttempt {
  at: number;
  requestHeaders: Record<string, string>;
  statusCode: number | null;
  latencyMs: number | null;
  responseBody: string;
  error: string | null;
}

export interface Delivery {
  id: string;
  eventId: string;
  event: string;
  targetId: string;
  url: string;
  body: string;
  signed: boolean;
  status: 'pending' | 'retrying' | 'delivered' | 'failed';
  attempts: DeliveryAttempt[];
  createdAt: number;
  nextAttemptAt: number | null;
  notes: string[];
}

export interface WebhookTarget {
  id: string;
  url: string;
  secret: string;
  events: string[] | null;
  enabled?: boolean;
}

export interface Faults {
  duplicateRate: number;
  outOfOrderRate: number;
  delayMs: number;
  unsignedRate: number;
}

export interface Session {
  csrf: string;
  accountId: string;
  keys: { keyId: string; keySecret: string }[];
  time: number;
  autoCapture: boolean;
  eventCount: number;
}
