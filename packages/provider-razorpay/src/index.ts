// @localpay/provider-razorpay — Razorpay wire format: routes, schemas, signatures,
// error envelope. Depends only on @localpay/core within this repo.
import { customerRoutes } from './routes/customers.ts';
import { disputeRoutes } from './routes/disputes.ts';
import { orderRoutes } from './routes/orders.ts';
import { paymentLinkRoutes } from './payment-links/routes.ts';
import { subscriptionRoutes } from './subscriptions/routes.ts';
import { paymentRoutes } from './routes/payments.ts';
import { refundRoutes } from './routes/refunds.ts';
import { settlementRoutes } from './routes/settlements.ts';

export * from './auth.ts';
export * from './checkout/routes.ts';
export * from './checkout/scenarios.ts';
export * from './errors.ts';
export * from './plugin.ts';
export * from './schemas.ts';
export * from './serializers.ts';
export * from './signatures.ts';
export * from './webhook-format.ts';
export { customerRoutes, orderRoutes, paymentRoutes, refundRoutes };
export { toWireCustomer } from './routes/customers.ts';
export { disputeRoutes, toWireDispute } from './routes/disputes.ts';
export { settlementRoutes, toWireSettlement } from './routes/settlements.ts';
export { paymentLinkRoutes };
export * from './payment-links/serializer.ts';
export { escapeHtml, paymentLinkPages } from './payment-links/page.ts';
export { subscriptionRoutes };
export * from './subscriptions/serializer.ts';

/** Every route group LocalPay serves for this provider. */
export const allRoutes = [orderRoutes, paymentRoutes, refundRoutes, customerRoutes, paymentLinkRoutes, subscriptionRoutes, disputeRoutes, settlementRoutes] as const;
