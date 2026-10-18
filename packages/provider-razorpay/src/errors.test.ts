import { EngineError } from '@localpay/core';
import { describe, expect, it } from 'vitest';
import { badRequest, fromEngineError, notFoundId, notFoundUrl, serverError, unauthorized } from './errors.ts';

describe('error envelope', () => {
  it('serialises as { error: {...} } with every field the SDKs read', () => {
    const json = JSON.parse(JSON.stringify(badRequest('bad amount', { field: 'amount' }))) as unknown;
    expect(json).toEqual({
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'bad amount',
        source: 'business',
        step: 'payment_initiation',
        reason: 'input_validation_failed',
        metadata: {},
        field: 'amount',
      },
    });
  });

  it('omits field when there is none', () => {
    expect(badRequest('x').body).not.toHaveProperty('field');
  });

  it('uses 401 for auth and 500 for server errors', () => {
    expect(unauthorized('no key').status).toBe(401);
    expect(serverError()).toMatchObject({ status: 500, body: { code: 'SERVER_ERROR' } });
  });

  it('maps not-found ids and urls to 400 bad requests', () => {
    expect(notFoundId()).toMatchObject({ status: 400, body: { description: 'The id provided does not exist', field: 'id' } });
    expect(notFoundUrl().status).toBe(400);
  });

  it('maps every engine reason to a description', () => {
    const error = fromEngineError(new EngineError('capture_amount_mismatch', 'x', 'amount'));
    expect(error.body).toMatchObject({ code: 'BAD_REQUEST_ERROR', reason: 'capture_amount_mismatch', field: 'amount' });
    expect(error.body.description).toMatch(/Capture amount/);
  });
});
