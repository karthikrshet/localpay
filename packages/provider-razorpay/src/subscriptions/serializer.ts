import type { Plan, Subscription } from '@localpay/core';
import { wireNotes } from '../serializers.ts';
import { hmacHex, signaturesMatch } from '../signatures.ts';

export function toWirePlan(plan: Plan) {
  return {
    id: plan.id,
    entity: 'plan',
    interval: plan.interval,
    period: plan.period,
    item: {
      // Items are not separate entities in LocalPay; the id is derived from the plan's.
      id: `item_${plan.id.slice('plan_'.length)}`,
      active: true,
      name: plan.item.name,
      description: plan.item.description,
      amount: plan.item.amount,
      unit_amount: plan.item.amount,
      currency: plan.item.currency,
      type: 'plan',
      unit: null,
      tax_inclusive: false,
      hsn_code: null,
      sac_code: null,
      tax_rate: null,
      tax_id: null,
      tax_group_id: null,
      created_at: plan.createdAt,
      updated_at: plan.createdAt,
    },
    notes: wireNotes(plan.notes),
    created_at: plan.createdAt,
  };
}

export function toWireSubscription(subscription: Subscription, baseUrl: string) {
  return {
    id: subscription.id,
    entity: 'subscription',
    plan_id: subscription.planId,
    customer_id: subscription.customerId,
    status: subscription.status,
    current_start: subscription.currentStart,
    current_end: subscription.currentEnd,
    ended_at: subscription.endedAt,
    quantity: subscription.quantity,
    notes: wireNotes(subscription.notes),
    charge_at: subscription.chargeAt,
    start_at: subscription.startAt,
    end_at: null,
    auth_attempts: subscription.authAttempts,
    total_count: subscription.totalCount,
    paid_count: subscription.paidCount,
    remaining_count: subscription.totalCount - subscription.paidCount,
    customer_notify: subscription.customerNotify,
    created_at: subscription.createdAt,
    expire_by: null,
    short_url: `${baseUrl.replace(/\/+$/, '')}/s/${subscription.id}`,
    has_scheduled_changes: subscription.cancelAtCycleEnd,
    change_scheduled_at: subscription.cancelAtCycleEnd ? subscription.currentEnd : null,
    source: 'api',
    offer_id: null,
  };
}

/** Checkout signature for subscriptions: HMAC of payment_id|subscription_id. */
export function subscriptionSignature(paymentId: string, subscriptionId: string, keySecret: string): string {
  return hmacHex(`${paymentId}|${subscriptionId}`, keySecret);
}

export function verifySubscriptionSignature(input: { paymentId: string; subscriptionId: string; signature: string }, keySecret: string): boolean {
  return signaturesMatch(subscriptionSignature(input.paymentId, input.subscriptionId, keySecret), input.signature);
}
