import { EngineError } from '@localpay/core';
import { describe, expect, it } from 'vitest';
import { badRequest } from './errors.ts';
import { toApiError } from './plugin.ts';
import { buildTestApp } from './test-helpers.ts';

describe('razorpayApi plugin', () => {
  it('rejects requests without credentials with 401 and the envelope', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/v1/orders' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'BAD_REQUEST_ERROR', description: 'Please provide your api key for authentication purposes.' } });
  });

  it('answers unknown URLs with a 400 envelope once authenticated', async () => {
    const { call } = await buildTestApp();
    const { status, body } = await call('GET', '/v1/nothing-here');
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: { description: 'The requested URL was not found on the server.' } });
  });

  it('maps malformed JSON to a 400 envelope', async () => {
    const { app } = await buildTestApp([(scoped) => scoped.post('/echo', (_req, reply) => reply.send({}))]);
    const response = await app.inject({
      method: 'POST', url: '/v1/echo', payload: '{oops',
      headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from('rzp_test_LocalPayDemo01:demo_secret').toString('base64')}` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { description: 'The request body must be valid JSON.' } });
  });

  it('turns unexpected exceptions into a 500 SERVER_ERROR without leaking details', async () => {
    const { call } = await buildTestApp([(scoped) => scoped.get('/boom', () => { throw new Error('secret internals'); })]);
    const { status, body } = await call('GET', '/v1/boom');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret internals');
    expect(body).toMatchObject({ error: { code: 'SERVER_ERROR' } });
  });
});

describe('toApiError', () => {
  it('passes ApiErrors through and maps EngineErrors', () => {
    const api = badRequest('x');
    expect(toApiError(api)).toBe(api);
    expect(toApiError(new EngineError('not_found', 'x', 'id')).body.description).toBe('The id provided does not exist');
  });
});
