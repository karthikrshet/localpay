// Errors the engine raises. `reason` is a stable machine key; providers map it to
// their own wire error (code, description, HTTP status).

export type EngineErrorReason =
  | 'not_found'
  | 'invalid_amount'
  | 'invalid_currency'
  | 'order_already_paid'
  | 'amount_exceeds_amount_due'
  | 'partial_payment_not_allowed'
  | 'payment_not_authorized'
  | 'payment_already_captured'
  | 'capture_amount_mismatch'
  | 'currency_mismatch'
  | 'payment_not_captured'
  | 'payment_fully_refunded'
  | 'refund_exceeds_payment'
  | 'refund_not_pending'
  | 'time_not_controllable'
  | 'customer_exists';

export class EngineError extends Error {
  readonly reason: EngineErrorReason;
  /** The request field at fault, when there is one. */
  readonly field: string | null;
  constructor(reason: EngineErrorReason, message: string, field: string | null = null) {
    super(message);
    this.name = 'EngineError';
    this.reason = reason;
    this.field = field;
  }
}

export function notFound(kind: string, id: string): EngineError {
  return new EngineError('not_found', `${kind} ${id} does not exist`, 'id');
}
