// Payment links. Each link owns an internal order, so paying a link reuses the normal
// checkout and capture flow; a capture on that order moves the link forward.
import type { Notes, Paise, Payment, PaymentLink, UnixSeconds } from '../entities/index.ts';
import { assertTransition } from '../machines/index.ts';
import type { EngineContext } from './context.ts';
import { EngineError, notFound } from './errors.ts';
import { assertAmount, type OrderOps } from './orders.ts';

export interface PaymentLinkInput {
  amount: Paise;
  currency?: string;
  description?: string | null;
  referenceId?: string | null;
  acceptPartial?: boolean;
  firstMinPartialAmount?: Paise | null;
  customer?: { name?: string | null; email?: string | null; contact?: string | null };
  notify?: { sms?: boolean; email?: boolean };
  reminderEnable?: boolean;
  notes?: Notes;
  callbackUrl?: string | null;
  callbackMethod?: 'get' | null;
  expireBy?: UnixSeconds | null;
  /** Key id that created the link; its secret signs the callback. */
  keyId?: string | null;
}

export interface PaymentLinkPatch {
  referenceId?: string | null;
  expireBy?: UnixSeconds | null;
  notes?: Notes;
  acceptPartial?: boolean;
}

const OPEN = new Set(['created', 'partially_paid']);

export function createPaymentLinkOps(ctx: EngineContext, orders: OrderOps) {
  const findPaymentLink = (id: string): PaymentLink | undefined => ctx.state.paymentLinks.get(id);
  const getPaymentLink = (id: string): PaymentLink => {
    const link = findPaymentLink(id);
    if (!link) throw notFound('payment link', id);
    return link;
  };
  const linkForOrder = (orderId: string | null): PaymentLink | undefined =>
    orderId ? [...ctx.state.paymentLinks.values()].find((l) => l.orderId === orderId) : undefined;

  const ops = {
    findPaymentLink,
    getPaymentLink,
    linkForOrder,

    createPaymentLink(input: PaymentLinkInput): PaymentLink {
      assertAmount(input.amount);
      if (input.referenceId && [...ctx.state.paymentLinks.values()].some((l) => l.referenceId === input.referenceId)) {
        throw new EngineError('duplicate_reference_id', 'a payment link with this reference_id already exists', 'reference_id');
      }
      if (input.expireBy != null && input.expireBy <= ctx.now()) throw new EngineError('invalid_expiry', 'expire_by must be in the future', 'expire_by');
      const order = orders.createOrder({ amount: input.amount, currency: input.currency ?? 'INR', partialPayment: input.acceptPartial ?? false, receipt: input.referenceId ?? null });
      const now = ctx.now();
      const link: PaymentLink = {
        id: ctx.newId('plink'),
        amount: input.amount,
        amountPaid: 0,
        currency: order.currency,
        description: input.description ?? null,
        referenceId: input.referenceId ?? null,
        status: 'created',
        acceptPartial: input.acceptPartial ?? false,
        firstMinPartialAmount: input.firstMinPartialAmount ?? null,
        customer: { name: input.customer?.name ?? null, email: input.customer?.email ?? null, contact: input.customer?.contact ?? null },
        notify: { sms: input.notify?.sms ?? false, email: input.notify?.email ?? false },
        reminderEnable: input.reminderEnable ?? false,
        notes: input.notes ?? {},
        callbackUrl: input.callbackUrl ?? null,
        callbackMethod: input.callbackMethod ?? null,
        expireBy: input.expireBy ?? null,
        expiredAt: null,
        cancelledAt: null,
        orderId: order.id,
        paymentIds: [],
        keyId: input.keyId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      ctx.emit('payment_link.created', { paymentLink: link });
      return link;
    },

    listPaymentLinks(filter: { referenceId?: string; paymentId?: string } = {}): PaymentLink[] {
      return [...ctx.state.paymentLinks.values()]
        .reverse()
        .filter((l) => (filter.referenceId === undefined || l.referenceId === filter.referenceId) && (filter.paymentId === undefined || l.paymentIds.includes(filter.paymentId)));
    },

    updatePaymentLink(id: string, patch: PaymentLinkPatch): PaymentLink {
      const current = getPaymentLink(id);
      if (!OPEN.has(current.status)) throw new EngineError('payment_link_inactive', `payment link ${id} is ${current.status}`);
      if (patch.expireBy != null && patch.expireBy <= ctx.now()) throw new EngineError('invalid_expiry', 'expire_by must be in the future', 'expire_by');
      const link: PaymentLink = {
        ...current,
        ...(patch.referenceId !== undefined && { referenceId: patch.referenceId }),
        ...(patch.expireBy !== undefined && { expireBy: patch.expireBy }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        ...(patch.acceptPartial !== undefined && { acceptPartial: patch.acceptPartial }),
        updatedAt: ctx.now(),
      };
      ctx.emit('payment_link.updated', { paymentLink: link });
      return link;
    },

    cancelPaymentLink(id: string): PaymentLink {
      const current = getPaymentLink(id);
      if (!OPEN.has(current.status)) throw new EngineError('payment_link_inactive', `payment link ${id} is ${current.status}`);
      assertTransition('paymentLink', current.status, 'cancelled');
      const link: PaymentLink = { ...current, status: 'cancelled', cancelledAt: ctx.now(), updatedAt: ctx.now() };
      ctx.emit('payment_link.cancelled', { paymentLink: link });
      return link;
    },

    /** Refuses payments on links that are no longer open. Called before every attempt. */
    assertPayable(orderId: string): void {
      const link = linkForOrder(orderId);
      if (link && !OPEN.has(link.status)) throw new EngineError('payment_link_inactive', `payment link ${link.id} is ${link.status}`);
    },

    /** Moves a link forward after a capture on its order. */
    afterCapture(payment: Payment): void {
      const current = linkForOrder(payment.orderId);
      if (!current) return;
      const amountPaid = current.amountPaid + payment.amount;
      const status = amountPaid >= current.amount ? 'paid' : 'partially_paid';
      assertTransition('paymentLink', current.status, status);
      const link: PaymentLink = { ...current, amountPaid, status, paymentIds: [...current.paymentIds, payment.id], updatedAt: ctx.now() };
      const order = orders.getOrder(link.orderId);
      ctx.emit(status === 'paid' ? 'payment_link.paid' : 'payment_link.partially_paid', { paymentLink: link, payment, order });
    },

    /** Expires open links whose expire_by has passed. Returns how many. */
    expireDuePaymentLinks(): number {
      const due = [...ctx.state.paymentLinks.values()].filter((l) => OPEN.has(l.status) && l.expireBy !== null && l.expireBy <= ctx.now());
      for (const current of due) {
        assertTransition('paymentLink', current.status, 'expired');
        ctx.emit('payment_link.expired', { paymentLink: { ...current, status: 'expired', expiredAt: ctx.now(), updatedAt: ctx.now() } });
      }
      return due.length;
    },
  };
  return ops;
}

export type PaymentLinkOps = ReturnType<typeof createPaymentLinkOps>;
