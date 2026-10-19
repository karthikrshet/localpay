// The dashboard API under /_localpay/api. Read views reuse the provider's wire JSON so
// the dashboard shows exactly what an SDK would see.
import { parseDuration, type AnyEvent, type ApiFaults, type Engine } from '@localpay/core';
import { toApiError, toWireCustomer, toWireDispute, toWireOrder, toWirePayment, toWirePaymentLink, toWirePlan, toWireRefund, toWireSettlement, toWireSubscription, WEBHOOK_EVENTS } from '@localpay/provider-razorpay';
import { BlockedTargetError, validateTargetUrl, type Dispatcher, type FaultConfig, type WebhookTarget } from '@localpay/webhooks';
import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { z } from 'zod';
import { checkAdminRequest, type AdminAuth } from './auth.ts';
import { scenarioRoutes } from './scenarios.ts';

export interface AdminApiOptions {
  engine: Engine;
  dispatcher: Dispatcher;
  webhookTargets: WebhookTarget[];
  auth: AdminAuth;
  accountId: string;
  keys: readonly { keyId: string; keySecret: string }[];
  /** Directory of gallery scenarios (YAML). */
  galleryDir?: string;
  /** Live API fault settings, edited in place. */
  apiFaults?: ApiFaults;
}

class AdminError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const parse = <S extends z.ZodType>(schema: S, value: unknown): z.output<S> => {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new AdminError(400, result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return result.data;
};

/** Ids of every entity an event carries, for per-entity timelines. */
export function entityIds(event: AnyEvent): string[] {
  const ids: string[] = [];
  for (const value of Object.values(event.data) as unknown[]) {
    if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
      ids.push(value.id);
      if ('orderId' in value && typeof value.orderId === 'string') ids.push(value.orderId);
      if ('paymentId' in value && typeof value.paymentId === 'string') ids.push(value.paymentId);
    }
  }
  return ids;
}

/** Case-insensitive substring search over the given fields (notes included). */
const matches = (query: string | undefined, values: unknown[]): boolean => !query || JSON.stringify(values).toLowerCase().includes(query.toLowerCase());

const targetsSchema = z.array(
  z.strictObject({
    url: z.string(),
    secret: z.string().min(1),
    events: z.array(z.string()).nullable().optional(),
    enabled: z.boolean().optional(),
  }),
);

const faultsSchema = z.strictObject({
  duplicateRate: z.number().min(0).max(1).optional(),
  outOfOrderRate: z.number().min(0).max(1).optional(),
  delayMs: z.number().int().min(0).max(600_000).optional(),
  unsignedRate: z.number().min(0).max(1).optional(),
});

export const adminApi: FastifyPluginCallback<AdminApiOptions> = (app, options, done) => {
  const { engine, dispatcher, webhookTargets, auth } = options;
  const timelineFor = (id: string) => engine.events.filter((e) => entityIds(e).includes(id));

  app.addHook('onRequest', (request, reply, next) => {
    const result = checkAdminRequest(request, auth);
    if (result === 'ok') {
      next();
      return;
    }
    void reply.code(result === 'unauthenticated' ? 401 : 403).send({ error: { description: result === 'unauthenticated' ? 'Open the dashboard link printed by localpay start.' : 'Missing or wrong CSRF token.' } });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AdminError) return reply.code(error.status).send({ error: { description: error.message } });
    const apiError = toApiError(error);
    return reply.code(apiError.status).send(apiError.toJSON());
  });

  app.get('/session', (_request, reply) =>
    reply.send({
      csrf: auth.csrf,
      accountId: options.accountId,
      keys: options.keys,
      time: engine.now(),
      autoCapture: engine.config.autoCapture,
      eventCount: engine.events.length,
    }),
  );

  app.get<{ Querystring: { after?: string; limit?: string } }>('/events', (request, reply) => {
    const after = Number(request.query.after ?? 0);
    const limit = Math.min(Number(request.query.limit ?? 500), 2000);
    return reply.send({ events: engine.events.filter((e) => e.seq > after).slice(-limit) });
  });

  // The whole event log as JSONL: a recording `localpay replay` can use.
  app.get('/events.jsonl', (_request, reply) =>
    reply
      .type('application/x-ndjson')
      .header('content-disposition', 'attachment; filename="localpay-session.jsonl"')
      .send(engine.events.map((e) => JSON.stringify(e)).join('\n') + (engine.events.length ? '\n' : '')),
  );

  app.get<{ Querystring: { q?: string } }>('/orders', (request, reply) => {
    const items = engine
      .listOrders()
      .filter((o) => matches(request.query.q, [o.id, o.receipt, o.status, o.notes]))
      .map((o) => ({ ...toWireOrder(o), payments: engine.listPayments({ orderId: o.id }).length }));
    return reply.send({ items });
  });

  app.get<{ Params: { id: string } }>('/orders/:id', (request, reply) => {
    const order = engine.getOrder(request.params.id);
    const payments = engine.listPayments({ orderId: order.id });
    const refunds = payments.flatMap((p) => engine.listRefunds({ paymentId: p.id }));
    return reply.send({ order: toWireOrder(order), payments: payments.map(toWirePayment), refunds: refunds.map(toWireRefund), events: timelineFor(order.id) });
  });

  app.get<{ Querystring: { q?: string } }>('/payments', (request, reply) => {
    const items = engine.listPayments().filter((p) => matches(request.query.q, [p.id, p.orderId, p.status, p.method, p.email, p.contact, p.vpa]));
    return reply.send({ items: items.map(toWirePayment) });
  });

  app.get<{ Params: { id: string } }>('/payments/:id', (request, reply) => {
    const payment = engine.getPayment(request.params.id);
    return reply.send({
      payment: toWirePayment(payment),
      refunds: engine.listRefunds({ paymentId: payment.id }).map(toWireRefund),
      disputes: engine.listDisputes({ paymentId: payment.id }).map(toWireDispute),
      events: timelineFor(payment.id),
    });
  });

  app.post<{ Params: { id: string } }>('/payments/:id/capture', (request, reply) => {
    const payment = engine.getPayment(request.params.id);
    return reply.send({ payment: toWirePayment(engine.capturePayment(payment.id, { amount: payment.amount })) });
  });

  const baseUrl = (request: { protocol: string; host: string }) => `${request.protocol}://${request.host}`;

  app.get('/customers', (_request, reply) => reply.send({ items: engine.listCustomers().map(toWireCustomer) }));

  app.get('/payment-links', (request, reply) =>
    reply.send({ items: engine.listPaymentLinks().map((l) => toWirePaymentLink(l, { baseUrl: baseUrl(request), payments: l.paymentIds.map((id) => engine.getPayment(id)) })) }),
  );
  app.post<{ Params: { id: string } }>('/payment-links/:id/cancel', (request, reply) => {
    const link = engine.cancelPaymentLink(request.params.id);
    return reply.send({ link: toWirePaymentLink(link, { baseUrl: baseUrl(request), payments: [] }) });
  });

  app.get('/subscriptions', (request, reply) =>
    reply.send({
      plans: engine.listPlans().map(toWirePlan),
      items: engine.listSubscriptions().map((s) => toWireSubscription(s, baseUrl(request))),
    }),
  );
  app.post<{ Params: { id: string } }>('/subscriptions/:id/cancel', (request, reply) =>
    reply.send({ subscription: toWireSubscription(engine.cancelSubscription(request.params.id), baseUrl(request)) }),
  );

  app.get('/settlements', (_request, reply) =>
    reply.send({ items: engine.listSettlements().map((s) => ({ ...toWireSettlement(s), payment_ids: s.paymentIds, refund_ids: s.refundIds, dispute_ids: s.disputeIds })) }),
  );

  app.post<{ Params: { id: string } }>('/payments/:id/late-authorize', (request, reply) =>
    reply.send({ payment: toWirePayment(engine.lateAuthorize(request.params.id)) }),
  );

  // The bank's side of disputes, which the merchant API cannot do.
  app.post<{ Params: { id: string } }>('/payments/:id/dispute', (request, reply) => {
    const body = parse(z.strictObject({ amount: z.number().int().optional(), reason_code: z.string().optional(), respond_in_days: z.number().int().min(1).max(60).optional() }), request.body);
    const dispute = engine.raiseDispute(request.params.id, {
      ...(body.amount !== undefined && { amount: body.amount }),
      ...(body.reason_code && { reasonCode: body.reason_code }),
      ...(body.respond_in_days !== undefined && { respondInDays: body.respond_in_days }),
    });
    return reply.send({ dispute: toWireDispute(dispute) });
  });
  app.post<{ Params: { id: string } }>('/disputes/:id/resolve', (request, reply) => {
    const { outcome } = parse(z.strictObject({ outcome: z.enum(['won', 'lost']) }), request.body);
    return reply.send({ dispute: toWireDispute(engine.resolveDispute(request.params.id, outcome)) });
  });
  app.post<{ Params: { id: string } }>('/disputes/:id/accept', (request, reply) => reply.send({ dispute: toWireDispute(engine.acceptDispute(request.params.id)) }));
  app.post<{ Params: { id: string } }>('/disputes/:id/submit', (request, reply) => reply.send({ dispute: toWireDispute(engine.contestDispute(request.params.id, {}, { submit: true })) }));

  app.post<{ Params: { id: string } }>('/refunds/:id/process', (request, reply) => reply.send({ refund: toWireRefund(engine.processRefund(request.params.id)) }));
  app.post<{ Params: { id: string } }>('/refunds/:id/fail', (request, reply) => reply.send({ refund: toWireRefund(engine.failRefund(request.params.id)) }));

  app.get('/webhooks/deliveries', (_request, reply) => reply.send({ items: dispatcher.list() }));

  const deliveryAction = (reply: FastifyReply, action: () => unknown) => {
    try {
      const result = action();
      void dispatcher.tick();
      return reply.send({ items: Array.isArray(result) ? result : [result] });
    } catch (error) {
      throw new AdminError(404, error instanceof Error ? error.message : 'delivery not found');
    }
  };
  app.post<{ Params: { id: string } }>('/webhooks/deliveries/:id/replay', (request, reply) => deliveryAction(reply, () => dispatcher.replay(request.params.id)));
  app.post<{ Params: { id: string } }>('/webhooks/deliveries/:id/replay-unsigned', (request, reply) => deliveryAction(reply, () => dispatcher.replay(request.params.id, { signed: false })));
  app.post<{ Params: { id: string } }>('/webhooks/deliveries/:id/send-twice', (request, reply) => deliveryAction(reply, () => dispatcher.sendTwice(request.params.id)));

  app.get('/webhooks/targets', (_request, reply) => reply.send({ items: webhookTargets, events: WEBHOOK_EVENTS }));

  app.put('/webhooks/targets', (request, reply) => {
    const next = parse(targetsSchema, request.body);
    for (const target of next) {
      try {
        validateTargetUrl(target.url);
      } catch (error) {
        throw new AdminError(400, error instanceof BlockedTargetError ? error.message : `invalid URL ${target.url}`);
      }
    }
    webhookTargets.splice(0, webhookTargets.length, ...next.map((t, i) => ({ id: `wh_${i + 1}`, url: t.url, secret: t.secret, events: t.events ?? null, enabled: t.enabled ?? true })));
    return reply.send({ items: webhookTargets });
  });

  app.get('/webhooks/faults', (_request, reply) => reply.send(dispatcher.faults()));
  app.put('/webhooks/faults', (request, reply) => reply.send(dispatcher.setFaults(parse(faultsSchema, request.body) as Partial<FaultConfig>)));

  app.get('/api-faults', (_request, reply) => reply.send(options.apiFaults ?? { rateLimitRate: 0, serverErrorRate: 0, delayMs: 0 }));
  app.put('/api-faults', (request, reply) => {
    if (!options.apiFaults) throw new AdminError(404, 'API fault injection is not available');
    const next = parse(z.strictObject({ rateLimitRate: z.number().min(0).max(1).optional(), serverErrorRate: z.number().min(0).max(1).optional(), delayMs: z.number().int().min(0).max(60_000).optional() }), request.body);
    Object.assign(options.apiFaults, next);
    return reply.send(options.apiFaults);
  });

  app.get('/time', (_request, reply) => reply.send({ now: engine.now(), offsetMs: 'offset' in engine.clock ? (engine.clock as { offset(): number }).offset() : 0 }));
  app.post('/time/advance', (request, reply) => {
    const { duration } = parse(z.strictObject({ duration: z.string() }), request.body);
    let ms: number;
    try {
      ms = parseDuration(duration);
    } catch (error) {
      throw new AdminError(400, error instanceof Error ? error.message : 'invalid duration');
    }
    const processed = engine.advanceTime(ms);
    void dispatcher.tick();
    return reply.send({ now: engine.now(), processed });
  });

  app.post('/reset', (_request, reply) => {
    engine.reset();
    return reply.send({ ok: true });
  });

  scenarioRoutes(app, { engine, dispatcher, ...(options.galleryDir && { galleryDir: options.galleryDir }) });

  app.get('/stream', (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    const send = (type: string, data: unknown) => reply.raw.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    send('hello', { seq: engine.events.length });
    const offEvents = engine.subscribe((event) => send('event', event));
    const offDeliveries = dispatcher.subscribe((delivery) => send('delivery', delivery));
    const offReset = engine.onReset(() => send('reset', {}));
    const keepAlive = setInterval(() => reply.raw.write(': keep-alive\n\n'), 15_000);
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      offEvents();
      offDeliveries();
      offReset();
    });
  });

  done();
};
