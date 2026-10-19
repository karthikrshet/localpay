import { KEY_ID, orders, razorpay } from '../../../lib/payments.ts';

// Orders are created on the server: the browser never decides the amount.
export async function POST(): Promise<Response> {
  const order = await razorpay.orders.create({ amount: 49900, currency: 'INR', receipt: `next-${orders.size + 1}` });
  orders.set(order.id, { status: 'created', events: [] });
  return Response.json({ order_id: order.id, amount: order.amount, currency: order.currency, key: KEY_ID });
}
