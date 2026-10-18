import type { Customer, Engine } from '@localpay/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listQuerySchema, notesSchema, parseWith } from '../schemas.ts';
import { collection, paginate, wireNotes } from '../serializers.ts';

const name = z.string().min(3, { error: 'The name must be at least 3 characters.' }).max(50, { error: 'The name may not be greater than 50 characters.' });
const email = z.email({ error: 'The email must be a valid email address.' });
const contact = z.string().regex(/^\+?\d{8,15}$/, { error: 'The contact must be a phone number of 8 to 15 digits.' });
const gstin = z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { error: 'The gstin is invalid.' });

export const createCustomerSchema = z.strictObject({
  name: name.optional(),
  email: email.optional(),
  contact: contact.optional(),
  gstin: gstin.optional(),
  notes: notesSchema.optional(),
  fail_existing: z.union([z.literal('0'), z.literal('1'), z.literal(0), z.literal(1), z.boolean()]).optional(),
});

export const updateCustomerSchema = z.strictObject({
  name: name.optional(),
  email: email.optional(),
  contact: contact.optional(),
  gstin: gstin.optional(),
  notes: notesSchema.optional(),
});

export function toWireCustomer(customer: Customer) {
  return {
    id: customer.id,
    entity: 'customer',
    name: customer.name,
    email: customer.email,
    contact: customer.contact,
    gstin: customer.gstin,
    notes: wireNotes(customer.notes),
    created_at: customer.createdAt,
  };
}

export function customerRoutes(app: FastifyInstance, engine: Engine): void {
  app.post('/customers', (request, reply) => {
    const { fail_existing: failExisting, ...body } = parseWith(createCustomerSchema, request.body);
    const customer = engine.createCustomer(body, { failExisting: !(failExisting === '0' || failExisting === 0 || failExisting === false) });
    return reply.send(toWireCustomer(customer));
  });

  app.get('/customers', (request, reply) => {
    const query = parseWith(listQuerySchema, request.query);
    return reply.send(collection(paginate(engine.listCustomers(), query).map(toWireCustomer)));
  });

  app.get<{ Params: { id: string } }>('/customers/:id', (request, reply) => reply.send(toWireCustomer(engine.getCustomer(request.params.id))));

  app.put<{ Params: { id: string } }>('/customers/:id', (request, reply) => {
    const patch = parseWith(updateCustomerSchema, request.body);
    return reply.send(toWireCustomer(engine.updateCustomer(request.params.id, patch)));
  });
}
