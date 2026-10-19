import { orders, verifyCheckout } from '../../../lib/payments.ts';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  const { razorpay_order_id: orderId = '', razorpay_payment_id: paymentId = '', razorpay_signature: signature = '' } = body;
  const verified = Boolean(orderId && paymentId && signature) && verifyCheckout(orderId, paymentId, signature);
  const order = orders.get(orderId);
  if (verified && order?.status === 'created') order.status = 'verified';
  return Response.json({ verified }, { status: verified ? 200 : 400 });
}
