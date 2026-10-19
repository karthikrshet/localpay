// Razorpay as a LocalPay provider plug-in.
import type { Provider } from '@localpay/core';
import type { FastifyInstance } from 'fastify';
import { isTestKeyId } from './auth.ts';
import { checkoutApi } from './checkout/routes.ts';
import { paymentLinkPages } from './payment-links/page.ts';
import { razorpayApi } from './plugin.ts';
import { customerRoutes } from './routes/customers.ts';
import { disputeRoutes } from './routes/disputes.ts';
import { orderRoutes } from './routes/orders.ts';
import { paymentRoutes } from './routes/payments.ts';
import { refundRoutes } from './routes/refunds.ts';
import { settlementRoutes } from './routes/settlements.ts';
import { paymentLinkRoutes } from './payment-links/routes.ts';
import { subscriptionRoutes } from './subscriptions/routes.ts';
import { razorpayWebhookFormat } from './webhook-format.ts';

/** Every route group LocalPay serves for this provider. */
export const allRoutes = [orderRoutes, paymentRoutes, refundRoutes, customerRoutes, paymentLinkRoutes, subscriptionRoutes, disputeRoutes, settlementRoutes] as const;

export const CHECKOUT_PREFIX = '/_localpay/checkout';

export const razorpayProvider: Provider<FastifyInstance> = {
  name: 'razorpay',
  isTestKeyId,
  async register(app, { engine, keys, allowedOrigins }) {
    await app.register(razorpayApi, { prefix: '/v1', engine, keys, routes: allRoutes });
    await app.register(paymentLinkPages, { engine, keys });
    await app.register(checkoutApi, { prefix: CHECKOUT_PREFIX, engine, keys, allowedOrigins });
  },
  webhookFormat: ({ accountId, publicUrl }) => razorpayWebhookFormat(accountId, publicUrl),
};
