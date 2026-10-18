import type { Engine, PaymentLink } from '@localpay/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../errors.ts';
import { notesSchema, parseWith } from '../schemas.ts';
import { toWirePaymentLink } from './serializer.ts';

const amount = z.number({ error: 'The amount field is required and must be a number.' }).int({ error: 'The amount must be an integer number of paise.' }).min(100, { error: 'The amount must be at least INR 1.00' });
const unixTime = z.number().int({ error: 'The expire_by must be a Unix timestamp in seconds.' });

export const createPaymentLinkSchema = z.strictObject({
  amount,
  currency: z.string().regex(/^[A-Z]{3}$/).default('INR'),
  accept_partial: z.boolean().optional(),
  first_min_partial_amount: amount.optional(),
  description: z.string().max(2048).optional(),
  reference_id: z.string().max(40, { error: 'The reference_id may not be greater than 40 characters.' }).optional(),
  customer: z.strictObject({ name: z.string().optional(), email: z.string().optional(), contact: z.string().optional() }).optional(),
  notify: z.strictObject({ sms: z.boolean().optional(), email: z.boolean().optional() }).optional(),
  reminder_enable: z.boolean().optional(),
  notes: notesSchema.optional(),
  callback_url: z.url({ error: 'The callback_url must be a valid URL.' }).optional(),
  callback_method: z.literal('get', { error: 'The callback_method must be get.' }).optional(),
  expire_by: unixTime.optional(),
  upi_link: z.boolean().optional(),
});

export const updatePaymentLinkSchema = z.strictObject({
  reference_id: z.string().max(40).optional(),
  expire_by: unixTime.optional(),
  notes: notesSchema.optional(),
  accept_partial: z.boolean().optional(),
  reminder_enable: z.boolean().optional(),
});

/** The public base URL of this server, as the caller reached it. */
export const baseUrlOf = (request: FastifyRequest): string => `${request.protocol}://${request.host}`;

export function paymentLinkRoutes(app: FastifyInstance, engine: Engine): void {
  const wire = (link: PaymentLink, request: FastifyRequest) =>
    toWirePaymentLink(link, { baseUrl: baseUrlOf(request), payments: link.paymentIds.map((id) => engine.getPayment(id)) });

  app.post('/payment_links', (request, reply) => {
    const body = parseWith(createPaymentLinkSchema, request.body);
    if (body.upi_link) throw badRequest('UPI payment links are not supported by LocalPay yet.', { field: 'upi_link' });
    if (body.callback_method && !body.callback_url) throw badRequest('The callback_url is required when callback_method is set.', { field: 'callback_url' });
    const keyId = request.headers.authorization ? Buffer.from(request.headers.authorization.replace(/^Basic\s+/i, ''), 'base64').toString().split(':')[0] : null;
    const link = engine.createPaymentLink({
      amount: body.amount,
      currency: body.currency,
      ...(body.accept_partial !== undefined && { acceptPartial: body.accept_partial }),
      firstMinPartialAmount: body.first_min_partial_amount ?? null,
      description: body.description ?? null,
      referenceId: body.reference_id ?? null,
      ...(body.customer && { customer: body.customer }),
      ...(body.notify && { notify: body.notify }),
      ...(body.reminder_enable !== undefined && { reminderEnable: body.reminder_enable }),
      notes: body.notes ?? {},
      callbackUrl: body.callback_url ?? null,
      callbackMethod: body.callback_method ?? null,
      expireBy: body.expire_by ?? null,
      keyId: keyId ?? null,
    });
    return reply.send(wire(link, request));
  });

  // The list endpoint answers { payment_links: [...] } rather than a collection.
  app.get<{ Querystring: { payment_id?: string; reference_id?: string } }>('/payment_links', (request, reply) => {
    const links = engine.listPaymentLinks({
      ...(request.query.payment_id && { paymentId: request.query.payment_id }),
      ...(request.query.reference_id && { referenceId: request.query.reference_id }),
    });
    return reply.send({ payment_links: links.map((l) => wire(l, request)) });
  });

  app.get<{ Params: { id: string } }>('/payment_links/:id', (request, reply) => reply.send(wire(engine.getPaymentLink(request.params.id), request)));

  app.patch<{ Params: { id: string } }>('/payment_links/:id', (request, reply) => {
    const body = parseWith(updatePaymentLinkSchema, request.body);
    const link = engine.updatePaymentLink(request.params.id, {
      ...(body.reference_id !== undefined && { referenceId: body.reference_id }),
      ...(body.expire_by !== undefined && { expireBy: body.expire_by }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.accept_partial !== undefined && { acceptPartial: body.accept_partial }),
    });
    return reply.send(wire(link, request));
  });

  app.post<{ Params: { id: string } }>('/payment_links/:id/cancel', (request, reply) => reply.send(wire(engine.cancelPaymentLink(request.params.id), request)));
}
