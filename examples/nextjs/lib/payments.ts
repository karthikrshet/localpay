// Server-only payment helpers shared by the route handlers.
import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { pointAtLocalPay } from '@localpay/shim-node';

export const KEY_ID = process.env.RAZORPAY_KEY_ID ?? 'rzp_test_LocalPayDemo01';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? 'localpay_demo_secret';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? 'localpay_webhook_secret';

export const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
// The one line that switches the official SDK to LocalPay.
if (process.env.LOCALPAY_URL) pointAtLocalPay(razorpay, process.env.LOCALPAY_URL);

export interface ShopOrder {
  status: 'created' | 'verified' | 'fulfilled' | 'failed';
  events: string[];
}

// In-memory store that survives Next.js hot reloads in development.
const globalStore = globalThis as unknown as { __shopOrders?: Map<string, ShopOrder>; __seenEvents?: Set<string> };
export const orders = (globalStore.__shopOrders ??= new Map<string, ShopOrder>());
export const seenEventIds = (globalStore.__seenEvents ??= new Set<string>());

const hmac = (message: string | Buffer, secret: string) => createHmac('sha256', secret).update(message).digest('hex');
const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const verifyCheckout = (orderId: string, paymentId: string, signature: string) => safeEqual(hmac(`${orderId}|${paymentId}`, KEY_SECRET), signature);
export const verifyWebhook = (rawBody: string, signature: string) => safeEqual(hmac(rawBody, WEBHOOK_SECRET), signature);
