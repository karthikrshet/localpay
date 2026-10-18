// @localpay/provider-razorpay — Razorpay wire format: routes, schemas, signatures,
// error envelope. Depends only on @localpay/core within this repo.
import { orderRoutes } from './routes/orders.ts';
import { paymentRoutes } from './routes/payments.ts';
import { refundRoutes } from './routes/refunds.ts';

export * from './auth.ts';
export * from './errors.ts';
export * from './plugin.ts';
export * from './schemas.ts';
export * from './serializers.ts';
export * from './signatures.ts';
export * from './webhook-format.ts';
export { orderRoutes, paymentRoutes, refundRoutes };

/** Every route group LocalPay serves for this provider. */
export const allRoutes = [orderRoutes, paymentRoutes, refundRoutes] as const;
