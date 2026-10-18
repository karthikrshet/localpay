import { describe, expect, it } from 'vitest';
import { ApiError } from './errors.ts';
import { captureSchema, createOrderSchema, createRefundSchema, listQuerySchema, parseWith, updateNotesSchema } from './schemas.ts';

const fail = (fn: () => unknown): ApiError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected an ApiError');
};

describe('createOrderSchema', () => {
  it('accepts a minimal order and defaults currency to INR', () => {
    expect(parseWith(createOrderSchema, { amount: 50000 })).toEqual({ amount: 50000, currency: 'INR' });
  });

  it('accepts all documented fields', () => {
    const body = { amount: 100, currency: 'INR', receipt: 'r', notes: { a: 'b', n: 1 }, partial_payment: true, first_payment_min_amount: 100, payment_capture: 1 };
    expect(parseWith(createOrderSchema, body)).toEqual(body);
  });

  it.each([
    [{}, 'amount', /amount field is required/],
    [{ amount: 99 }, 'amount', /at least INR 1.00/],
    [{ amount: 100.5 }, 'amount', /integer/],
    [{ amount: '100' }, 'amount', /must be a number/],
    [{ amount: 100, receipt: 'x'.repeat(41) }, 'receipt', /40 characters/],
    [{ amount: 100, currency: 'inr' }, 'currency', /3-letter/],
  ])('rejects %j on %s', (body, field, message) => {
    const error = fail(() => parseWith(createOrderSchema, body));
    expect(error.status).toBe(400);
    expect(error.body.field).toBe(field);
    expect(error.body.description).toMatch(message);
  });

  it('rejects unknown fields the way the gateway does', () => {
    const error = fail(() => parseWith(createOrderSchema, { amount: 100, colour: 'red' }));
    expect(error.body).toMatchObject({ description: 'colour is/are not required and should not be sent', field: 'colour' });
  });
});

describe('notes', () => {
  it('treats an empty array as no notes', () => {
    expect(parseWith(updateNotesSchema, { notes: [] })).toEqual({ notes: {} });
  });

  it('allows 15 notes but not 16', () => {
    const notes = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'v']));
    expect(() => parseWith(updateNotesSchema, { notes: notes(15) })).not.toThrow();
    expect(fail(() => parseWith(updateNotesSchema, { notes: notes(16) })).body.description).toMatch(/less than or equal to 15/);
  });

  it('limits values to 256 characters', () => {
    expect(fail(() => parseWith(updateNotesSchema, { notes: { k: 'x'.repeat(257) } })).body.field).toBe('notes.k');
  });
});

describe('capture and refund bodies', () => {
  it('requires a capture amount', () => {
    expect(parseWith(captureSchema, { amount: 500, currency: 'INR' })).toEqual({ amount: 500, currency: 'INR' });
    expect(fail(() => parseWith(captureSchema, {})).body.field).toBe('amount');
  });

  it('allows an empty refund body and validates speed', () => {
    expect(parseWith(createRefundSchema, undefined)).toEqual({});
    expect(fail(() => parseWith(createRefundSchema, { speed: 'instant' })).body.description).toMatch(/normal or optimum/);
  });
});

describe('listQuerySchema', () => {
  it('coerces query strings and applies defaults', () => {
    expect(parseWith(listQuerySchema, { count: '5', from: '1700000000' })).toEqual({ count: 5, skip: 0, from: 1700000000 });
    expect(parseWith(listQuerySchema, {})).toEqual({ count: 10, skip: 0 });
  });

  it('caps count at 100', () => {
    expect(fail(() => parseWith(listQuerySchema, { count: '101' })).body.description).toBe('The count may not be greater than 100.');
  });
});
