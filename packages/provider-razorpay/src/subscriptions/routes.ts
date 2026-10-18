import type { Engine } from '@localpay/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../errors.ts';
import { baseUrlOf } from '../payment-links/routes.ts';
import { listQuerySchema, notesSchema, parseWith } from '../schemas.ts';
import { collection, paginate } from '../serializers.ts';
import { toWirePlan, toWireSubscription } from './serializer.ts';

const flag = z.union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1')]).transform((v) => v === true || v === 1 || v === '1');

export const createPlanSchema = z.strictObject({
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly'], { error: 'The period must be daily, weekly, monthly or yearly.' }),
  interval: z.number().int().min(1, { error: 'The interval must be at least 1.' }),
  item: z.strictObject({
    name: z.string().min(1, { error: 'The item name is required.' }),
    amount: z.number().int().min(100, { error: 'The amount must be at least INR 1.00' }),
    currency: z.string().regex(/^[A-Z]{3}$/).default('INR'),
    description: z.string().optional(),
  }),
  notes: notesSchema.optional(),
});

export const createSubscriptionSchema = z.strictObject({
  plan_id: z.string().min(1, { error: 'The plan_id field is required.' }),
  total_count: z.number().int().min(1, { error: 'The total_count must be at least 1.' }),
  quantity: z.number().int().min(1).optional(),
  start_at: z.number().int().optional(),
  customer_notify: flag.optional(),
  customer_id: z.string().optional(),
  notes: notesSchema.optional(),
  addons: z.array(z.unknown()).optional(),
  offer_id: z.string().optional(),
});

const cancelSchema = z.strictObject({ cancel_at_cycle_end: flag.optional() });

export function subscriptionRoutes(app: FastifyInstance, engine: Engine): void {
  app.post('/plans', (request, reply) => {
    const body = parseWith(createPlanSchema, request.body);
    const plan = engine.createPlan({ period: body.period, interval: body.interval, item: { ...body.item, description: body.item.description ?? null }, notes: body.notes ?? {} });
    return reply.send(toWirePlan(plan));
  });

  app.get('/plans', (request, reply) => {
    const query = parseWith(listQuerySchema, request.query);
    return reply.send(collection(paginate(engine.listPlans(), query).map(toWirePlan)));
  });

  app.get<{ Params: { id: string } }>('/plans/:id', (request, reply) => reply.send(toWirePlan(engine.getPlan(request.params.id))));

  app.post('/subscriptions', (request, reply) => {
    const body = parseWith(createSubscriptionSchema, request.body);
    if (body.addons?.length) throw badRequest('Subscription add-ons are not supported by LocalPay yet.', { field: 'addons' });
    if (body.offer_id) throw badRequest('Offers are not supported by LocalPay.', { field: 'offer_id' });
    if (body.customer_id) engine.getCustomer(body.customer_id);
    const subscription = engine.createSubscription({
      planId: body.plan_id,
      totalCount: body.total_count,
      ...(body.quantity !== undefined && { quantity: body.quantity }),
      startAt: body.start_at ?? null,
      customerId: body.customer_id ?? null,
      ...(body.customer_notify !== undefined && { customerNotify: body.customer_notify }),
      notes: body.notes ?? {},
    });
    return reply.send(toWireSubscription(subscription, baseUrlOf(request)));
  });

  app.get<{ Querystring: { plan_id?: string } }>('/subscriptions', (request, reply) => {
    const query = parseWith(listQuerySchema, request.query);
    const items = engine.listSubscriptions(request.query.plan_id ? { planId: request.query.plan_id } : {});
    return reply.send(collection(paginate(items, query).map((s) => toWireSubscription(s, baseUrlOf(request)))));
  });

  app.get<{ Params: { id: string } }>('/subscriptions/:id', (request, reply) => reply.send(toWireSubscription(engine.getSubscription(request.params.id), baseUrlOf(request))));

  app.post<{ Params: { id: string } }>('/subscriptions/:id/cancel', (request, reply) => {
    const body = parseWith(cancelSchema, request.body);
    const subscription = engine.cancelSubscription(request.params.id, { atCycleEnd: body.cancel_at_cycle_end ?? false });
    return reply.send(toWireSubscription(subscription, baseUrlOf(request)));
  });
}
