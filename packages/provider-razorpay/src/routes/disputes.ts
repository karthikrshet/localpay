import type { Dispute, Engine } from '@localpay/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listQuerySchema, parseWith } from '../schemas.ts';
import { collection, paginate } from '../serializers.ts';

const docs = z.array(z.string().max(100)).max(20);

export const contestSchema = z.strictObject({
  action: z.enum(['draft', 'submit'], { error: 'The action must be draft or submit.' }).default('draft'),
  amount: z.number().int().optional(),
  summary: z.string().max(1000).optional(),
  shipping_proof: docs.optional(),
  billing_proof: docs.optional(),
  others: docs.optional(),
});

export function toWireDispute(dispute: Dispute) {
  const evidence = dispute.evidence;
  return {
    id: dispute.id,
    entity: 'dispute',
    payment_id: dispute.paymentId,
    amount: dispute.amount,
    currency: dispute.currency,
    amount_deducted: dispute.amountDeducted,
    gateway_dispute_id: null,
    reason_code: dispute.reasonCode,
    reason_description: dispute.reasonDescription,
    respond_by: dispute.respondBy,
    status: dispute.status,
    phase: dispute.phase,
    comments: null,
    evidence: evidence
      ? {
          amount: dispute.amount,
          summary: evidence.summary ?? null,
          shipping_proof: evidence.shippingProof ?? [],
          billing_proof: evidence.billingProof ?? [],
          others: evidence.others ?? [],
          submitted_at: dispute.status === 'open' ? null : dispute.resolvedAt ?? dispute.createdAt,
        }
      : null,
    created_at: dispute.createdAt,
  };
}

export function disputeRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/disputes', (request, reply) => {
    const query = parseWith(listQuerySchema, request.query);
    return reply.send(collection(paginate(engine.listDisputes(), query).map(toWireDispute)));
  });

  app.get<{ Params: { id: string } }>('/disputes/:id', (request, reply) => reply.send(toWireDispute(engine.getDispute(request.params.id))));

  app.post<{ Params: { id: string } }>('/disputes/:id/accept', (request, reply) => reply.send(toWireDispute(engine.acceptDispute(request.params.id))));

  app.patch<{ Params: { id: string } }>('/disputes/:id/contest', (request, reply) => {
    const body = parseWith(contestSchema, request.body);
    const dispute = engine.contestDispute(
      request.params.id,
      {
        ...(body.summary !== undefined && { summary: body.summary }),
        ...(body.shipping_proof && { shippingProof: body.shipping_proof }),
        ...(body.billing_proof && { billingProof: body.billing_proof }),
        ...(body.others && { others: body.others }),
      },
      { submit: body.action === 'submit' },
    );
    return reply.send(toWireDispute(dispute));
  });
}
