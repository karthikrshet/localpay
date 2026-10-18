import type { Engine } from '@localpay/core';
import type { FastifyInstance } from 'fastify';
import { captureSchema, listQuerySchema, parseWith, updateNotesSchema } from '../schemas.ts';
import { collection, paginate, toWirePayment } from '../serializers.ts';

interface IdParams {
  id: string;
}

export function paymentRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/payments', (request, reply) => {
    const query = parseWith(listQuerySchema, request.query);
    return reply.send(collection(paginate(engine.listPayments(), query).map(toWirePayment)));
  });

  app.get<{ Params: IdParams }>('/payments/:id', (request, reply) => reply.send(toWirePayment(engine.getPayment(request.params.id))));

  app.patch<{ Params: IdParams }>('/payments/:id', (request, reply) => {
    const { notes } = parseWith(updateNotesSchema, request.body);
    return reply.send(toWirePayment(engine.updatePaymentNotes(request.params.id, notes)));
  });

  app.post<{ Params: IdParams }>('/payments/:id/capture', (request, reply) => {
    const body = parseWith(captureSchema, request.body);
    const payment = engine.capturePayment(request.params.id, { amount: body.amount, ...(body.currency !== undefined && { currency: body.currency }) });
    return reply.send(toWirePayment(payment));
  });
}
