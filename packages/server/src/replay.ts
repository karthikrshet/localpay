// Record-and-replay: re-deliver the webhooks of a recorded session (a JSONL event log
// written by `localpay start --record`) to a target, in the original order and with the
// original event ids. Used to regression-test webhook handlers in CI.
import { createFileEventStore, createManualClock, createRandom, type AnyEvent } from '@localpay/core';
import { razorpayWebhookFormat } from '@localpay/provider-razorpay';
import { createDispatcher, type Delivery, type Sender } from '@localpay/webhooks';

export interface ReplayOptions {
  url: string;
  secret: string;
  accountId?: string;
  /** Only these event names. */
  events?: readonly string[];
  send?: Sender;
}

export interface ReplayResult {
  total: number;
  delivered: number;
  failed: Delivery[];
  deliveries: Delivery[];
}

export function loadRecording(path: string): AnyEvent[] {
  return createFileEventStore(path).load();
}

export async function replayEvents(events: readonly AnyEvent[], options: ReplayOptions): Promise<ReplayResult> {
  const clock = createManualClock(events[0]?.at ?? 0);
  let counter = 0;
  const dispatcher = createDispatcher({
    format: razorpayWebhookFormat(options.accountId ?? 'acc_LocalPayDemo01'),
    targets: () => [{ id: 'replay', url: options.url, secret: options.secret, events: options.events ?? null }],
    clock,
    random: createRandom('replay'),
    newId: (prefix) => `${prefix}_replay${String(++counter).padStart(8, '0')}`,
    // One attempt each: a replay reports what the handler does now, it does not wait.
    retryDelaysMs: [],
    ...(options.send && { send: options.send }),
  });
  for (const event of events) {
    dispatcher.enqueue(event);
    // Send one at a time so the order on the wire is the recorded order.
    await dispatcher.tick();
  }
  const deliveries = dispatcher.list().reverse();
  const failed = deliveries.filter((d) => d.status !== 'delivered');
  return { total: deliveries.length, delivered: deliveries.length - failed.length, failed, deliveries };
}
