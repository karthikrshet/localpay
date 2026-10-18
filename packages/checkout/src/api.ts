// Calls to LocalPay's checkout API. The base URL is wherever checkout.js was loaded from.
import type { FailureResponse, Method, OrderDetails, Scenario, SuccessResponse } from './types.ts';

export interface CheckoutApi {
  order(orderId: string, keyId: string): Promise<OrderDetails>;
  subscription(subscriptionId: string, keyId: string): Promise<OrderDetails>;
  scenarios(): Promise<Scenario[]>;
  pay(input: { keyId: string; orderId?: string; subscriptionId?: string; method: Method; scenario: string; email?: string; contact?: string; vpa?: string }): Promise<SuccessResponse | FailureResponse>;
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: { description?: string } };
  if (!response.ok) throw new Error(body.error?.description ?? `LocalPay returned HTTP ${response.status}`);
  return body;
}

export function createApi(baseUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): CheckoutApi {
  const root = `${baseUrl.replace(/\/+$/, '')}/_localpay/checkout`;
  return {
    order: async (orderId, keyId) => json<OrderDetails>(await fetchImpl(`${root}/orders/${encodeURIComponent(orderId)}?key_id=${encodeURIComponent(keyId)}`)),
    subscription: async (subscriptionId, keyId) => {
      const details = await json<{ id: string; amount: number; currency: string; status: string }>(
        await fetchImpl(`${root}/subscriptions/${encodeURIComponent(subscriptionId)}?key_id=${encodeURIComponent(keyId)}`),
      );
      return { ...details, amount_due: details.amount };
    },
    scenarios: async () => (await json<{ scenarios: Scenario[] }>(await fetchImpl(`${root}/scenarios`))).scenarios,
    pay: async (input) =>
      json<SuccessResponse | FailureResponse>(
        await fetchImpl(`${root}/pay`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            key_id: input.keyId,
            ...(input.orderId && { order_id: input.orderId }),
            ...(input.subscriptionId && { subscription_id: input.subscriptionId }),
            method: input.method,
            scenario: input.scenario,
            ...(input.email && { email: input.email }),
            ...(input.contact && { contact: input.contact }),
            ...(input.vpa && { vpa: input.vpa }),
          }),
        }),
      ),
  };
}

export const isFailure = (response: SuccessResponse | FailureResponse): response is FailureResponse => 'error' in response;
