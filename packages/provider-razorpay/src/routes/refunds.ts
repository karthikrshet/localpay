import type { Engine } from '@localpay/core';
import type { FastifyInstance } from 'fastify';
import { notFoundId } from '../errors.ts';
import { createRefundSchema, listQuerySchema, parseWith, updateNotesSchema } from '../schemas.ts';
import { collection, paginate, toWireRefund } from '../serializers.ts';

interface IdParams {
  id: string;
}

export function refundRoutes(app: FastifyInstance, engine: Engine): void {
  app.post<{ Params: IdParams }>('/payments/:id/refund', (request, reply) => {
    const body = parseWith(createRefundSchema, request.body);
    const refund = engine.createRefund(request.params.id, {
      ...(body.amount !== undefined && { amount: body.amount }),
      ...(body.speed !== undefined && { speed: body.speed }),
      notes: body.notes ?? {},
      receipt: body.receipt ?? null,
    });
    return reply.send(toWireRefund(refund));
  });

  app.get<{ Params: IdParams }>('/payments/:id/refunds', (request, reply) => {
    const query = parseWith(listQuerySchema, request.query);
    const payment = engine.getPayment(request.params.id);
    return reply.send(collection(paginate(engine.listRefunds({ paymentId: payment.id }), query).map(toWireRefund)));
  });

  app.get<{ Params: IdParams & { refundId: string } }>('/payments/:id/refunds/:refundId', (request, reply) => {
    const refund = engine.findRefund(request.params.refundId);
    if (!refund || refund.paymentId !== request.params.id) throw notFoundId();
    return reply.send(toWireRefund(refund));
  });

  app.get('/refunds', (request, reply) => {
    const query = parseWith(listQuerySchema, request.query);
    return reply.send(collection(paginate(engine.listRefunds(), query).map(toWireRefund)));
  });

  app.get<{ Params: IdParams }>('/refunds/:id', (request, reply) => reply.send(toWireRefund(engine.getRefund(request.params.id))));

  app.patch<{ Params: IdParams }>('/refunds/:id', (request, reply) => {
    const { notes } = parseWith(updateNotesSchema, request.body);
    return reply.send(toWireRefund(engine.updateRefundNotes(request.params.id, notes)));
  });
}
