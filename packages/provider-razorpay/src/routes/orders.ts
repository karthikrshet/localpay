import type { Engine } from '@localpay/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createOrderSchema, listQuerySchema, parseWith, updateNotesSchema } from '../schemas.ts';
import { collection, paginate, toWireOrder, toWirePayment } from '../serializers.ts';

const orderListQuery = listQuerySchema.extend({
  receipt: z.string().optional(),
  authorized: z.enum(['0', '1']).optional(),
});

interface IdParams {
  id: string;
}

export function orderRoutes(app: FastifyInstance, engine: Engine): void {
  app.post('/orders', (request, reply) => {
    const body = parseWith(createOrderSchema, request.body);
    const order = engine.createOrder({
      amount: body.amount,
      currency: body.currency,
      receipt: body.receipt ?? null,
      notes: body.notes ?? {},
      partialPayment: body.partial_payment ?? false,
      autoCapture: body.payment_capture === undefined ? null : Boolean(body.payment_capture),
    });
    return reply.send(toWireOrder(order));
  });

  app.get('/orders', (request, reply) => {
    const query = parseWith(orderListQuery, request.query);
    const orders = engine.listOrders().filter(
      (order) =>
        (query.receipt === undefined || order.receipt === query.receipt) &&
        (query.authorized === undefined || engine.listPayments({ orderId: order.id }).some((p) => p.status === 'authorized') === (query.authorized === '1')),
    );
    return reply.send(collection(paginate(orders, query).map(toWireOrder)));
  });

  app.get<{ Params: IdParams }>('/orders/:id', (request, reply) => reply.send(toWireOrder(engine.getOrder(request.params.id))));

  app.patch<{ Params: IdParams }>('/orders/:id', (request, reply) => {
    const { notes } = parseWith(updateNotesSchema, request.body);
    return reply.send(toWireOrder(engine.updateOrderNotes(request.params.id, notes)));
  });

  app.get<{ Params: IdParams }>('/orders/:id/payments', (request, reply) => {
    const order = engine.getOrder(request.params.id);
    return reply.send(collection(engine.listPayments({ orderId: order.id }).map(toWirePayment)));
  });
}
