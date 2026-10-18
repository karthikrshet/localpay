// The Razorpay error envelope and the mapping from engine errors to it.
// Descriptions describe behaviour in our own words; exact upstream strings are
// confirmed against recorded fixtures before compat.md marks them supported.
import type { EngineError, EngineErrorReason } from '@localpay/core';

export type ErrorCode = 'BAD_REQUEST_ERROR' | 'GATEWAY_ERROR' | 'SERVER_ERROR';

export interface ErrorBody {
  code: ErrorCode;
  description: string;
  source: string;
  step: string;
  reason: string;
  metadata: Record<string, unknown>;
  field?: string;
}

export interface ErrorEnvelope {
  error: ErrorBody;
}

/** An error that is already in wire form, with its HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorBody;
  constructor(status: number, body: ErrorBody) {
    super(body.description);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
  toJSON(): ErrorEnvelope {
    return { error: this.body };
  }
}

export function badRequest(description: string, options: { field?: string | null; reason?: string; step?: string } = {}): ApiError {
  return new ApiError(400, {
    code: 'BAD_REQUEST_ERROR',
    description,
    source: 'business',
    step: options.step ?? 'payment_initiation',
    reason: options.reason ?? 'input_validation_failed',
    metadata: {},
    ...(options.field ? { field: options.field } : {}),
  });
}

export function unauthorized(description: string): ApiError {
  return new ApiError(401, { code: 'BAD_REQUEST_ERROR', description, source: 'NA', step: 'NA', reason: 'NA', metadata: {} });
}

export function serverError(): ApiError {
  return new ApiError(500, {
    code: 'SERVER_ERROR',
    description: 'The server encountered an error. The incident has been reported to admins.',
    source: 'NA',
    step: 'NA',
    reason: 'server_error',
    metadata: {},
  });
}

export const notFoundId = (): ApiError => badRequest('The id provided does not exist', { field: 'id', reason: 'NA' });
export const notFoundUrl = (): ApiError => badRequest('The requested URL was not found on the server.', { reason: 'NA' });

const DESCRIPTIONS: Record<EngineErrorReason, string> = {
  not_found: 'The id provided does not exist',
  invalid_amount: 'The amount must be at least INR 1.00',
  invalid_currency: 'The currency provided is not supported',
  order_already_paid: 'Order has already been paid',
  amount_exceeds_amount_due: 'The amount is greater than the amount due on the order',
  partial_payment_not_allowed: 'Partial payment is not enabled for this order',
  payment_not_authorized: 'Only payments which have been authorized and not yet captured can be captured',
  payment_already_captured: 'This payment has already been captured',
  capture_amount_mismatch: 'Capture amount must be equal to the amount authorized',
  currency_mismatch: 'Currency should be the same as the payment currency',
  payment_not_captured: 'The payment status should be captured for a refund to be created',
  payment_fully_refunded: 'The payment has been fully refunded already',
  refund_exceeds_payment: 'The refund amount provided is greater than the amount not yet refunded',
  refund_not_pending: 'The refund is not in a pending state',
  time_not_controllable: 'Time travel is not enabled for this server',
  customer_exists: 'Customer already exists for the merchant',
  duplicate_reference_id: 'The reference_id has already been used for another payment link',
  invalid_expiry: 'The expire_by time must be in the future',
  payment_link_inactive: 'The payment link is no longer active',
  invalid_plan: 'The plan is invalid',
  subscription_not_authenticatable: 'The subscription cannot be authenticated in its current state',
  subscription_ended: 'The subscription has already ended',
  dispute_not_open: 'The dispute cannot be changed in its current state',
};

export function fromEngineError(error: EngineError): ApiError {
  return badRequest(DESCRIPTIONS[error.reason], { field: error.field, reason: error.reason === 'not_found' ? 'NA' : error.reason });
}
