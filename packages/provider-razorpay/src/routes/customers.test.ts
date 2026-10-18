import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-helpers.ts';
import { customerRoutes } from './customers.ts';

const setup = () => buildTestApp([customerRoutes]);

describe('customers API', () => {
  it('creates and fetches a customer', async () => {
    const { call } = await setup();
    const created = await call('POST', '/v1/customers', { name: 'Asha Rao', email: 'asha@example.com', contact: '+919999999991', notes: { tier: 'gold' } });
    expect(created).toMatchObject({ status: 200, body: { entity: 'customer', name: 'Asha Rao', email: 'asha@example.com', contact: '+919999999991', gstin: null, notes: { tier: 'gold' } } });
    expect(created.body.id).toMatch(/^cust_/);
    expect((await call('GET', `/v1/customers/${String(created.body.id)}`)).body).toEqual(created.body);
  });

  it('fails on a duplicate unless fail_existing is "0"', async () => {
    const { call } = await setup();
    const body = { name: 'Ravi K', email: 'ravi@example.com', contact: '+919999999992' };
    const first = await call('POST', '/v1/customers', body);
    expect((await call('POST', '/v1/customers', body)).body).toMatchObject({ error: { description: 'Customer already exists for the merchant' } });
    expect((await call('POST', '/v1/customers', { ...body, fail_existing: '0' })).body).toEqual(first.body);
  });

  it('validates fields', async () => {
    const { call } = await setup();
    expect((await call('POST', '/v1/customers', { email: 'not-an-email' })).body).toMatchObject({ error: { field: 'email' } });
    expect((await call('POST', '/v1/customers', { contact: '12' })).body).toMatchObject({ error: { field: 'contact' } });
    expect((await call('POST', '/v1/customers', { gstin: 'nope' })).body).toMatchObject({ error: { field: 'gstin' } });
  });

  it('lists and edits customers', async () => {
    const { call, app } = await setup();
    const created = await call('POST', '/v1/customers', { name: 'Meera' });
    expect((await call('GET', '/v1/customers')).body).toMatchObject({ entity: 'collection', count: 1 });
    const response = await app.inject({
      method: 'PUT', url: `/v1/customers/${String(created.body.id)}`, payload: { name: 'Meera S', gstin: '29ABCDE1234F1Z5' },
      headers: { authorization: `Basic ${Buffer.from('rzp_test_LocalPayDemo01:demo_secret').toString('base64')}` },
    });
    expect(response.json()).toMatchObject({ name: 'Meera S', gstin: '29ABCDE1234F1Z5' });
  });
});
