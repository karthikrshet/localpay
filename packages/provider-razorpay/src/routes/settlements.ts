import type { Engine, Settlement } from '@localpay/core';
import type { FastifyInstance } from 'fastify';
import { listQuerySchema, parseWith } from '../schemas.ts';
import { collection, paginate } from '../serializers.ts';

export function toWireSettlement(settlement: Settlement) {
  return {
    id: settlement.id,
    entity: 'settlement',
    amount: settlement.amount,
    status: settlement.status,
    fees: settlement.fees,
    tax: settlement.tax,
    utr: settlement.utr,
    created_at: settlement.createdAt,
  };
}

export function settlementRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/settlements', (request, reply) => {
    const query = parseWith(listQuerySchema, request.query);
    return reply.send(collection(paginate(engine.listSettlements(), query).map(toWireSettlement)));
  });

  app.get<{ Params: { id: string } }>('/settlements/:id', (request, reply) => reply.send(toWireSettlement(engine.getSettlement(request.params.id))));
}
