import { orders, seenEventIds, verifyWebhook } from '../../../lib/payments.ts';

export async function POST(request: Request): Promise<Response> {
  // Verify the exact bytes before parsing: re-serialised JSON would not match the signature.
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get('x-razorpay-signature') ?? '')) return new Response('bad signature', { status: 400 });

  const eventId = request.headers.get('x-razorpay-event-id');
  if (eventId && seenEventIds.has(eventId)) return new Response('duplicate ignored');
  if (eventId) seenEventIds.add(eventId);

  const event = JSON.parse(raw) as { event: string; payload?: { payment?: { entity?: { order_id?: string } } } };
  const order = orders.get(event.payload?.payment?.entity?.order_id ?? '');
  if (order) {
    order.events.push(event.event);
    if (event.event === 'payment.captured' || event.event === 'order.paid') order.status = 'fulfilled';
    else if (event.event === 'payment.failed' && order.status !== 'fulfilled') order.status = 'failed';
    // payment.authorized: the money is only blocked. Do not ship yet.
  }
  return new Response('ok');
}
