import { describe, expect, it } from 'vitest';
import { createEngine } from './index.ts';

describe('customers', () => {
  it('creates, fetches, lists and updates customers through events', () => {
    const engine = createEngine({ seed: 'customers' });
    const a = engine.createCustomer({ name: 'Asha', email: 'asha@example.com', contact: '+919999999991', notes: { tier: 'gold' } });
    expect(a).toMatchObject({ name: 'Asha', email: 'asha@example.com', gstin: null, notes: { tier: 'gold' } });
    expect(a.id).toMatch(/^cust_[0-9A-Za-z]{14}$/);
    const b = engine.createCustomer({ name: 'Ravi' });
    expect(engine.listCustomers().map((c) => c.id)).toEqual([b.id, a.id]);
    expect(engine.updateCustomer(a.id, { name: 'Asha K', gstin: '29ABCDE1234F1Z5' })).toMatchObject({ name: 'Asha K', email: 'asha@example.com', gstin: '29ABCDE1234F1Z5' });
    expect(engine.getCustomer(a.id).name).toBe('Asha K');
    expect(engine.events.map((e) => e.type)).toEqual(['customer.created', 'customer.created', 'customer.updated']);
  });

  it('fails on duplicates unless failExisting is false', () => {
    const engine = createEngine({ seed: 'dupes' });
    const first = engine.createCustomer({ email: 'x@example.com', contact: '+919999999992' });
    expect(() => engine.createCustomer({ email: 'x@example.com', contact: '+919999999992' })).toThrow(expect.objectContaining({ reason: 'customer_exists' }) as Error);
    expect(engine.createCustomer({ email: 'x@example.com', contact: '+919999999992' }, { failExisting: false })).toEqual(first);
    expect(engine.listCustomers()).toHaveLength(1);
  });

  it('reports unknown customers', () => {
    expect(() => createEngine().getCustomer('cust_missing0000000')).toThrow(expect.objectContaining({ reason: 'not_found' }) as Error);
  });
});
