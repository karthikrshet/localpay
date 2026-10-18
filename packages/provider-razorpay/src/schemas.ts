// Zod schemas for every request body and list query. Limits mirror the gateway
// so that a request LocalPay accepts is one the real API accepts too.
import { z } from 'zod';
import { badRequest, type ApiError } from './errors.ts';

export const MAX_NOTES = 15;
export const MAX_NOTE_LENGTH = 256;
export const MAX_RECEIPT_LENGTH = 40;
export const MIN_AMOUNT = 100;

const amount = (label = 'amount') =>
  z
    .number({ error: `The ${label} field is required and must be a number.` })
    .int({ error: `The ${label} must be an integer number of paise.` })
    .min(MIN_AMOUNT, { error: `The ${label} must be at least INR 1.00` });

/** Notes: up to 15 pairs, values up to 256 characters. An empty array means no notes. */
export const notesSchema = z.preprocess(
  (value) => (Array.isArray(value) && value.length === 0 ? {} : value),
  z
    .record(z.string(), z.union([z.string().max(MAX_NOTE_LENGTH, { error: `Notes values may not be greater than ${MAX_NOTE_LENGTH} characters.` }), z.number()]), {
      error: 'The notes field must be an object of key-value pairs.',
    })
    .refine((notes) => Object.keys(notes).length <= MAX_NOTES, { error: `Number of fields in notes should be less than or equal to ${MAX_NOTES}` }),
);

const receipt = z.string().max(MAX_RECEIPT_LENGTH, { error: `The receipt may not be greater than ${MAX_RECEIPT_LENGTH} characters.` });
const currency = z.string().regex(/^[A-Z]{3}$/, { error: 'The currency must be a 3-letter ISO code such as INR.' });

export const createOrderSchema = z.strictObject({
  amount: amount(),
  currency: currency.default('INR'),
  receipt: receipt.optional(),
  notes: notesSchema.optional(),
  partial_payment: z.boolean().optional(),
  first_payment_min_amount: amount('first_payment_min_amount').optional(),
  payment_capture: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
});

export const updateNotesSchema = z.strictObject({ notes: notesSchema });

export const captureSchema = z.strictObject({
  amount: amount(),
  currency: currency.optional(),
});

export const createRefundSchema = z.strictObject({
  amount: amount().optional(),
  speed: z.enum(['normal', 'optimum'], { error: 'The speed must be normal or optimum.' }).optional(),
  notes: notesSchema.optional(),
  receipt: receipt.optional(),
});

const queryInt = (min: number, max?: number) => {
  const base = z.coerce.number({ error: 'must be an integer' }).int({ error: 'must be an integer' }).min(min);
  return max === undefined ? base : base.max(max, { error: `may not be greater than ${max}.` });
};

export const listQuerySchema = z.object({
  count: queryInt(1, 100).default(10),
  skip: queryInt(0).default(0),
  from: queryInt(0).optional(),
  to: queryInt(0).optional(),
});

export type ListQuery = z.output<typeof listQuerySchema>;

function toApiError(error: z.ZodError): ApiError {
  const issue = error.issues[0];
  if (!issue) return badRequest('The request is invalid.');
  if (issue.code === 'unrecognized_keys') {
    return badRequest(`${issue.keys.join(', ')} is/are not required and should not be sent`, { field: issue.keys[0] ?? null });
  }
  const field = issue.path.map(String).join('.') || null;
  const message = issue.message.startsWith('Invalid input') ? `The ${field ?? 'request'} field is invalid.` : issue.message;
  return badRequest(field && !/^The /.test(message) ? `The ${field} ${message}` : message, { field });
}

/** Parses input or throws a Razorpay-shaped 400 for the first problem found. */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw toApiError(result.error);
  return result.data;
}
