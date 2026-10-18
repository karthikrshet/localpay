// Webhook dispatcher: one delivery per event per target, retries with backoff, a
// delivery log, manual replay, and failure injection (duplicates, reordering,
// delays, missing signatures) so apps can be tested against messy delivery.
import type { AnyEvent, Clock, Random, WebhookFormat } from '@localpay/core';
import { httpSender, isSuccess, type Sender } from './sender.ts';

export interface WebhookTarget {
  id: string;
  url: string;
  secret: string;
  /** Only these event names; all when empty or missing. */
  events?: readonly string[] | null;
  enabled?: boolean;
}

export interface FaultConfig {
  /** Probability (0–1) that a delivery is sent twice with the same event id. */
  duplicateRate: number;
  /** Probability that a delivery is held back so later events overtake it. */
  outOfOrderRate: number;
  /** Extra delay before every first attempt, in ms. */
  delayMs: number;
  /** Probability that the signature header is left out. */
  unsignedRate: number;
}

export const NO_FAULTS: FaultConfig = { duplicateRate: 0, outOfOrderRate: 0, delayMs: 0, unsignedRate: 0 };
/** How long an out-of-order delivery is held back. */
export const OUT_OF_ORDER_HOLD_MS = 3000;
/** Delays before attempts 2..5. Five attempts in total, then the delivery fails. */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [5_000, 30_000, 120_000, 600_000];

export type DeliveryNote = 'duplicate' | 'out-of-order' | 'unsigned' | 'delayed' | 'replay';
export type DeliveryStatus = 'pending' | 'retrying' | 'delivered' | 'failed';

export interface DeliveryAttempt {
  at: number;
  requestHeaders: Record<string, string>;
  statusCode: number | null;
  latencyMs: number | null;
  responseBody: string;
  error: string | null;
}

export interface Delivery {
  id: string;
  eventId: string;
  event: string;
  targetId: string;
  url: string;
  /** Exact bytes sent; the signature covers these. */
  body: string;
  signed: boolean;
  status: DeliveryStatus;
  attempts: DeliveryAttempt[];
  createdAt: number;
  nextAttemptAt: number | null;
  notes: DeliveryNote[];
}

export interface DispatcherOptions {
  format: WebhookFormat;
  targets: () => readonly WebhookTarget[];
  clock: Clock;
  random: Random;
  newId: (prefix: string) => string;
  send?: Sender;
  retryDelaysMs?: readonly number[];
  faults?: Partial<FaultConfig>;
  /** Finished deliveries kept in the log. */
  maxLog?: number;
}

export type DeliveryListener = (delivery: Delivery) => void;

export function createDispatcher(options: DispatcherOptions) {
  const send = options.send ?? httpSender;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const maxLog = options.maxLog ?? 1000;
  const deliveries = new Map<string, Delivery>();
  const listeners = new Set<DeliveryListener>();
  let faults: FaultConfig = { ...NO_FAULTS, ...options.faults };
  let running: Promise<number> | null = null;

  const notify = (delivery: Delivery): void => {
    for (const listener of listeners) listener(delivery);
  };
  const roll = (rate: number): boolean => rate > 0 && options.random.next() < rate;
  const isOpen = (d: Delivery): boolean => d.status === 'pending' || d.status === 'retrying';

  function trim(): void {
    if (deliveries.size <= maxLog) return;
    for (const [id, delivery] of deliveries) {
      if (deliveries.size <= maxLog) break;
      if (!isOpen(delivery)) deliveries.delete(id);
    }
  }

  function create(target: WebhookTarget, eventId: string, event: string, body: string, init: { signed: boolean; dueAt: number; notes: DeliveryNote[] }): Delivery {
    const delivery: Delivery = {
      id: options.newId('whd'),
      eventId,
      event,
      targetId: target.id,
      url: target.url,
      body,
      signed: init.signed,
      status: 'pending',
      attempts: [],
      createdAt: options.clock.now(),
      nextAttemptAt: init.dueAt,
      notes: init.notes,
    };
    deliveries.set(delivery.id, delivery);
    trim();
    notify(delivery);
    return delivery;
  }

  async function attempt(delivery: Delivery): Promise<void> {
    const target = options.targets().find((t) => t.id === delivery.targetId);
    const record: DeliveryAttempt = { at: options.clock.now(), requestHeaders: {}, statusCode: null, latencyMs: null, responseBody: '', error: null };
    let ok = false;
    if (!target) {
      record.error = 'webhook target was removed';
    } else {
      record.requestHeaders = options.format.headers(delivery.body, target.secret, delivery.eventId, { signed: delivery.signed });
      try {
        const result = await send({ url: delivery.url, headers: record.requestHeaders, body: delivery.body });
        Object.assign(record, { statusCode: result.statusCode, latencyMs: result.latencyMs, responseBody: result.responseBody });
        ok = isSuccess(result.statusCode);
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
      }
    }
    delivery.attempts.push(record);
    const retryIn = target ? retryDelays[delivery.attempts.length - 1] : undefined;
    if (ok) {
      delivery.status = 'delivered';
      delivery.nextAttemptAt = null;
    } else if (retryIn !== undefined) {
      delivery.status = 'retrying';
      delivery.nextAttemptAt = options.clock.now() + retryIn;
    } else {
      delivery.status = 'failed';
      delivery.nextAttemptAt = null;
    }
    notify(delivery);
  }

  const dispatcher = {
    /** Queues deliveries for an engine event. Returns the deliveries created. */
    enqueue(event: AnyEvent): Delivery[] {
      const message = options.format.format(event);
      if (!message) return [];
      const body = JSON.stringify(message.payload);
      const now = options.clock.now();
      const created: Delivery[] = [];
      for (const target of options.targets()) {
        if (target.enabled === false) continue;
        if (target.events?.length && !target.events.includes(message.name)) continue;
        const notes: DeliveryNote[] = [];
        let dueAt = now;
        if (faults.delayMs > 0) {
          dueAt += faults.delayMs;
          notes.push('delayed');
        }
        if (roll(faults.outOfOrderRate)) {
          dueAt += OUT_OF_ORDER_HOLD_MS;
          notes.push('out-of-order');
        }
        const signed = !roll(faults.unsignedRate);
        if (!signed) notes.push('unsigned');
        created.push(create(target, event.id, message.name, body, { signed, dueAt, notes }));
        if (roll(faults.duplicateRate)) created.push(create(target, event.id, message.name, body, { signed, dueAt, notes: [...notes, 'duplicate'] }));
      }
      return created;
    },

    /** Sends every delivery that is due, oldest first, one at a time. Returns how many. */
    tick(): Promise<number> {
      if (running) return running;
      running = (async () => {
        let sent = 0;
        // Loop: deliveries enqueued while this pass was sending are picked up too.
        for (;;) {
          const now = options.clock.now();
          const due = [...deliveries.values()]
            .filter((d) => isOpen(d) && d.nextAttemptAt !== null && d.nextAttemptAt <= now)
            .sort((a, b) => (a.nextAttemptAt ?? 0) - (b.nextAttemptAt ?? 0));
          if (due.length === 0) return sent;
          for (const delivery of due) await attempt(delivery);
          sent += due.length;
        }
      })().finally(() => {
        running = null;
      });
      return running;
    },

    /** Sends a past delivery again now, with the same body and event id. */
    replay(id: string, overrides: { signed?: boolean } = {}): Delivery {
      const original = deliveries.get(id);
      if (!original) throw new Error(`delivery ${id} not found`);
      const target = options.targets().find((t) => t.id === original.targetId) ?? { id: original.targetId, url: original.url, secret: '' };
      const signed = overrides.signed ?? original.signed;
      return create(target, original.eventId, original.event, original.body, { signed, dueAt: options.clock.now(), notes: signed ? ['replay'] : ['replay', 'unsigned'] });
    },

    /** Replays a delivery twice, to test idempotency on the receiving side. */
    sendTwice(id: string): Delivery[] {
      return [dispatcher.replay(id), dispatcher.replay(id)].map((d) => {
        if (!d.notes.includes('duplicate')) d.notes.push('duplicate');
        return d;
      });
    },

    get: (id: string): Delivery | undefined => deliveries.get(id),
    /** Newest first. */
    list: (): Delivery[] => [...deliveries.values()].reverse(),
    faults: (): FaultConfig => ({ ...faults }),
    setFaults(partial: Partial<FaultConfig>): FaultConfig {
      for (const [key, value] of Object.entries(partial)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (key !== 'delayMs' && value > 1)) {
          throw new RangeError(`invalid fault setting ${key}=${String(value)}`);
        }
      }
      faults = { ...faults, ...partial };
      return dispatcher.faults();
    },
    subscribe(listener: DeliveryListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear(): void {
      deliveries.clear();
    },
  };
  return dispatcher;
}

export type Dispatcher = ReturnType<typeof createDispatcher>;
