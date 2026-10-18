import type { Notes, Order, Paise } from '../entities/index.ts';
import { isPaise } from '../money/index.ts';
import type { EngineContext } from './context.ts';
import { EngineError, notFound } from './errors.ts';

export interface CreateOrderInput {
  amount: Paise;
  currency?: string;
  receipt?: string | null;
  notes?: Notes;
  partialPayment?: boolean;
  autoCapture?: boolean | null;
}

export const amountDue = (order: Order): Paise => order.amount - order.amountPaid;

export function assertAmount(amount: unknown, field = 'amount'): asserts amount is Paise {
  if (!isPaise(amount) || amount === 0) throw new EngineError('invalid_amount', `${field} must be a positive integer in paise`, field);
}

export function createOrderOps(ctx: EngineContext) {
  const findOrder = (id: string): Order | undefined => ctx.state.orders.get(id);
  const getOrder = (id: string): Order => {
    const order = findOrder(id);
    if (!order) throw notFound('order', id);
    return order;
  };

  return {
    findOrder,
    getOrder,

    createOrder(input: CreateOrderInput): Order {
      assertAmount(input.amount);
      const currency = input.currency ?? 'INR';
      if (!/^[A-Z]{3}$/.test(currency)) throw new EngineError('invalid_currency', 'currency must be a 3-letter ISO code', 'currency');
      const order: Order = {
        id: ctx.newId('order'),
        amount: input.amount,
        amountPaid: 0,
        currency,
        receipt: input.receipt ?? null,
        notes: input.notes ?? {},
        status: 'created',
        attempts: 0,
        partialPayment: input.partialPayment ?? false,
        autoCapture: input.autoCapture ?? null,
        createdAt: ctx.now(),
      };
      ctx.emit('order.created', { order });
      return order;
    },

    /** Newest first, like the gateway's list endpoints. */
    listOrders(): Order[] {
      return [...ctx.state.orders.values()].reverse();
    },

    updateOrderNotes(id: string, notes: Notes): Order {
      const order: Order = { ...getOrder(id), notes };
      ctx.emit('order.updated', { order });
      return order;
    },
  };
}

export type OrderOps = ReturnType<typeof createOrderOps>;
