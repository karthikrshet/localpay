import { orders } from '../../../../lib/payments.ts';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const order = orders.get(id);
  return order ? Response.json(order) : Response.json({ error: 'unknown order' }, { status: 404 });
}
