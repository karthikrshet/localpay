import type { Customer, Notes } from '../entities/index.ts';
import type { EngineContext } from './context.ts';
import { EngineError, notFound } from './errors.ts';

export interface CustomerInput {
  name?: string | null;
  email?: string | null;
  contact?: string | null;
  gstin?: string | null;
  notes?: Notes;
}

export function createCustomerOps(ctx: EngineContext) {
  const findCustomer = (id: string): Customer | undefined => ctx.state.customers.get(id);
  const getCustomer = (id: string): Customer => {
    const customer = findCustomer(id);
    if (!customer) throw notFound('customer', id);
    return customer;
  };
  /** A customer is "the same" when email and contact both match. */
  const findExisting = (input: CustomerInput): Customer | undefined =>
    [...ctx.state.customers.values()].find((c) => c.email === (input.email ?? null) && c.contact === (input.contact ?? null));

  return {
    findCustomer,
    getCustomer,

    /** With failExisting false, returns the matching customer instead of failing. */
    createCustomer(input: CustomerInput, options: { failExisting?: boolean } = {}): Customer {
      const existing = input.email || input.contact ? findExisting(input) : undefined;
      if (existing) {
        if (options.failExisting === false) return existing;
        throw new EngineError('customer_exists', 'a customer with this email and contact already exists');
      }
      const customer: Customer = {
        id: ctx.newId('cust'),
        name: input.name ?? null,
        email: input.email ?? null,
        contact: input.contact ?? null,
        gstin: input.gstin ?? null,
        notes: input.notes ?? {},
        createdAt: ctx.now(),
      };
      ctx.emit('customer.created', { customer });
      return customer;
    },

    listCustomers(): Customer[] {
      return [...ctx.state.customers.values()].reverse();
    },

    updateCustomer(id: string, patch: CustomerInput): Customer {
      const current = getCustomer(id);
      const customer: Customer = {
        ...current,
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.email !== undefined && { email: patch.email }),
        ...(patch.contact !== undefined && { contact: patch.contact }),
        ...(patch.gstin !== undefined && { gstin: patch.gstin }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
      };
      ctx.emit('customer.updated', { customer });
      return customer;
    },
  };
}

export type CustomerOps = ReturnType<typeof createCustomerOps>;
