// The API behind checkout.js. Called from the merchant's page with only the public
// key id, like the real checkout; the key secret is used here to sign results.
import type { Engine } from '@localpay/core';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { isLiveKeyId, LIVE_KEY_MESSAGE, type ApiKey } from '../auth.ts';
import { ApiError, badRequest, unauthorized } from '../errors.ts';
import { toApiError } from '../plugin.ts';
import { parseWith } from '../schemas.ts';
import { checkoutSignature } from '../signatures.ts';
import { subscriptionSignature } from '../subscriptions/serializer.ts';
import { CHECKOUT_SCENARIOS, MAGIC_VALUES, resolveScenario } from './scenarios.ts';

export interface CheckoutApiOptions {
  engine: Engine;
  keys: readonly ApiKey[];
  /** Extra origins (besides localhost) allowed to use checkout, e.g. https://myapp.test. */
  allowedOrigins?: readonly string[];
}

const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\]|[a-z0-9-]+\.localhost)(?::\d+)?$/i;

export function isAllowedOrigin(origin: string, extra: readonly string[] = []): boolean {
  return LOOPBACK_ORIGIN.test(origin) || extra.includes(origin);
}

const paySchema = z.strictObject({
  key_id: z.string().min(1),
  order_id: z.string().min(1).optional(),
  subscription_id: z.string().min(1).optional(),
  method: z.enum(['upi', 'card', 'netbanking', 'wallet']),
  scenario: z.string().min(1),
  email: z.string().max(254).optional(),
  contact: z.string().max(20).optional(),
  vpa: z.string().max(100).optional(),
  bank: z.string().max(20).optional(),
  wallet: z.string().max(20).optional(),
});

export const checkoutApi: FastifyPluginCallback<CheckoutApiOptions> = (app, options, done) => {
  const findKey = (keyId: string | undefined): ApiKey => {
    if (keyId && isLiveKeyId(keyId)) throw unauthorized(LIVE_KEY_MESSAGE);
    const key = options.keys.find((k) => k.keyId === keyId);
    if (!key) throw unauthorized('The key_id given to checkout is not configured in LocalPay.');
    return key;
  };

  app.setErrorHandler((error, _request, reply) => {
    const apiError = toApiError(error);
    return reply.code(apiError.status).send(apiError.toJSON());
  });

  app.addHook('onRequest', (request, reply, next) => {
    const origin = request.headers.origin;
    if (origin) {
      if (!isAllowedOrigin(origin, options.allowedOrigins)) {
        const error = new ApiError(403, { ...badRequest('').body, description: `Checkout is not allowed from ${origin}. Add it to allowedOrigins if this is your app.` });
        void reply.code(403).send(error.toJSON());
        return;
      }
      void reply.header('access-control-allow-origin', origin).header('vary', 'origin');
    }
    next();
  });

  app.options('/*', (_request, reply) =>
    reply.code(204).header('access-control-allow-methods', 'GET, POST').header('access-control-allow-headers', 'content-type').header('access-control-max-age', '600').send(),
  );

  app.get('/scenarios', (_request, reply) =>
    reply.send({ scenarios: CHECKOUT_SCENARIOS.map(({ id, label, effect }) => ({ id, label, effect })), magic: MAGIC_VALUES }),
  );

  app.get<{ Params: { id: string }; Querystring: { key_id?: string } }>('/orders/:id', (request, reply) => {
    findKey(request.query.key_id);
    const order = options.engine.getOrder(request.params.id);
    return reply.send({ id: order.id, amount: order.amount, amount_due: order.amount - order.amountPaid, currency: order.currency, status: order.status, receipt: order.receipt });
  });

  app.get<{ Params: { id: string }; Querystring: { key_id?: string } }>('/subscriptions/:id', (request, reply) => {
    findKey(request.query.key_id);
    const subscription = options.engine.getSubscription(request.params.id);
    const plan = options.engine.getPlan(subscription.planId);
    return reply.send({ id: subscription.id, amount: plan.item.amount * subscription.quantity, currency: plan.item.currency, status: subscription.status, plan: plan.item.name });
  });

  app.post('/pay', (request, reply) => {
    const body = parseWith(paySchema, request.body);
    const key = findKey(body.key_id);
    if ((body.order_id === undefined) === (body.subscription_id === undefined)) {
      throw badRequest('Send exactly one of order_id or subscription_id.', { field: 'order_id' });
    }

    if (body.subscription_id) {
      const subscription = options.engine.getSubscription(body.subscription_id);
      // Magic values apply to what is charged now: the first cycle, or the mandate authorization.
      const scenario = resolveScenario(body.scenario, { amount: options.engine.authenticationAmount(subscription.id), method: body.method, vpa: body.vpa ?? null });
      if (!scenario) throw badRequest(`Unknown checkout scenario "${body.scenario}".`, { field: 'scenario' });
      const { payment } = options.engine.authenticateSubscription(subscription.id, { method: body.method, outcome: scenario.outcome });
      if (payment.status === 'failed' && payment.error) {
        return reply.send({ error: { ...payment.error, metadata: { payment_id: payment.id, subscription_id: subscription.id } } });
      }
      return reply.send({
        razorpay_payment_id: payment.id,
        razorpay_subscription_id: subscription.id,
        razorpay_signature: subscriptionSignature(payment.id, subscription.id, key.keySecret),
      });
    }

    const order = options.engine.getOrder(body.order_id ?? '');
    const scenario = resolveScenario(body.scenario, { amount: order.amount - order.amountPaid, method: body.method, vpa: body.vpa ?? null });
    if (!scenario) throw badRequest(`Unknown checkout scenario "${body.scenario}".`, { field: 'scenario' });

    const payment = options.engine.attemptPayment({
      orderId: order.id,
      method: body.method,
      outcome: scenario.outcome,
      email: body.email ?? null,
      contact: body.contact ?? null,
      vpa: body.vpa ?? null,
      bank: body.bank ?? null,
      wallet: body.wallet ?? null,
    });

    if (payment.status === 'failed' && payment.error) {
      // Same shape as the `response.error` object of checkout's payment.failed event.
      return reply.send({ error: { ...payment.error, metadata: { payment_id: payment.id, order_id: order.id } } });
    }
    return reply.send({
      razorpay_payment_id: payment.id,
      razorpay_order_id: order.id,
      razorpay_signature: checkoutSignature(order.id, payment.id, key.keySecret),
    });
  });

  done();
};
