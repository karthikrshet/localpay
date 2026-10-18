import { createEngine, createManualClock, createRandom, type AnyEvent, type WebhookFormat } from '@localpay/core';
import { describe, expect, it } from 'vitest';
import { createDispatcher, OUT_OF_ORDER_HOLD_MS, type DispatcherOptions, type WebhookTarget } from './dispatcher.ts';
import type { SendRequest, SendResult } from './sender.ts';

const format: WebhookFormat = {
  events: ['thing.happened'],
  format: (event) => (event.type === 'order.created' ? { name: 'thing.happened', payload: { id: event.data.order.id } } : null),
  headers: (body, secret, eventId, opts) => ({ 'x-event': eventId, ...(opts?.signed === false ? {} : { 'x-sig': `${secret}:${body.length}` }) }),
};

const setup = (overrides: Partial<DispatcherOptions> = {}, statuses: (number | Error)[] = []) => {
  const clock = createManualClock(1_000_000);
  const engine = createEngine({ seed: 'dispatch', clock });
  const sent: SendRequest[] = [];
  const send = (request: SendRequest): Promise<SendResult> => {
    sent.push(request);
    const next = statuses.shift() ?? 200;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve({ statusCode: next, responseBody: 'ok', latencyMs: 3 });
  };
  const targets: WebhookTarget[] = [{ id: 't1', url: 'http://localhost:3000/hook', secret: 's1' }];
  const dispatcher = createDispatcher({ format, targets: () => targets, clock, random: createRandom('faults'), newId: (prefix) => engine.newId(prefix), send, ...overrides });
  const event = (): AnyEvent => {
    engine.createOrder({ amount: 100 });
    return engine.events.at(-1) as AnyEvent;
  };
  return { clock, dispatcher, sent, targets, event };
};

describe('dispatcher', () => {
  it('delivers each formatted event once, signed, and logs the attempt', async () => {
    const { dispatcher, sent, event } = setup();
    const e = event();
    const [delivery] = dispatcher.enqueue(e);
    expect(await dispatcher.tick()).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.headers).toMatchObject({ 'x-event': e.id, 'x-sig': `s1:${sent[0]?.body.length}` });
    expect(dispatcher.get(delivery?.id ?? '')).toMatchObject({ status: 'delivered', attempts: [{ statusCode: 200, latencyMs: 3 }] });
  });

  it('ignores events the format does not deliver, disabled targets and filtered events', () => {
    const { dispatcher, targets, event } = setup();
    expect(dispatcher.enqueue({ seq: 1, id: 'evt_x', type: 'clock.advanced', at: 0, data: { from: 0, to: 1 } })).toEqual([]);
    targets.push({ id: 't2', url: 'http://localhost:1/x', secret: 's', enabled: false }, { id: 't3', url: 'http://localhost:1/y', secret: 's', events: ['other.event'] });
    expect(dispatcher.enqueue(event())).toHaveLength(1);
  });

  it('retries with backoff and gives up after the last delay', async () => {
    const { dispatcher, clock, event } = setup({ retryDelaysMs: [1000, 2000] }, [500, new Error('ECONNREFUSED'), 503]);
    const [delivery] = dispatcher.enqueue(event());
    await dispatcher.tick();
    expect(dispatcher.get(delivery?.id ?? '')).toMatchObject({ status: 'retrying', nextAttemptAt: clock.now() + 1000 });
    expect(await dispatcher.tick()).toBe(0);
    clock.advance(1000);
    await dispatcher.tick();
    expect(dispatcher.get(delivery?.id ?? '')?.attempts[1]?.error).toBe('ECONNREFUSED');
    clock.advance(2000);
    await dispatcher.tick();
    expect(dispatcher.get(delivery?.id ?? '')).toMatchObject({ status: 'failed', nextAttemptAt: null });
    expect(dispatcher.get(delivery?.id ?? '')?.attempts).toHaveLength(3);
  });

  it('replays and sends twice with the same event id and body', async () => {
    const { dispatcher, sent, event } = setup();
    const [delivery] = dispatcher.enqueue(event());
    await dispatcher.tick();
    dispatcher.sendTwice(delivery?.id ?? '');
    await dispatcher.tick();
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((s) => s.headers['x-event'])).size).toBe(1);
    expect(new Set(sent.map((s) => s.body)).size).toBe(1);
    expect(dispatcher.list()[0]?.notes).toEqual(['replay', 'duplicate']);
  });

  it('can replay without a signature', async () => {
    const { dispatcher, sent, event } = setup();
    const [delivery] = dispatcher.enqueue(event());
    dispatcher.replay(delivery?.id ?? '', { signed: false });
    await dispatcher.tick();
    expect(sent.map((s) => 'x-sig' in s.headers)).toEqual([true, false]);
  });

  describe('fault injection', () => {
    it('duplicates deliveries', () => {
      const { dispatcher, event } = setup({ faults: { duplicateRate: 1 } });
      const created = dispatcher.enqueue(event());
      expect(created.map((d) => d.notes)).toEqual([[], ['duplicate']]);
      expect(created[0]?.eventId).toBe(created[1]?.eventId);
    });

    it('holds deliveries back so later events overtake them', async () => {
      const { dispatcher, sent, clock, event } = setup();
      dispatcher.setFaults({ outOfOrderRate: 1 });
      const first = event();
      dispatcher.enqueue(first);
      dispatcher.setFaults({ outOfOrderRate: 0 });
      const second = event();
      dispatcher.enqueue(second);
      await dispatcher.tick();
      clock.advance(OUT_OF_ORDER_HOLD_MS);
      await dispatcher.tick();
      expect(sent.map((s) => s.headers['x-event'])).toEqual([second.id, first.id]);
    });

    it('delays and strips signatures', async () => {
      const { dispatcher, sent, clock, event } = setup({ faults: { delayMs: 500, unsignedRate: 1 } });
      dispatcher.enqueue(event());
      expect(await dispatcher.tick()).toBe(0);
      clock.advance(500);
      await dispatcher.tick();
      expect(sent[0]?.headers).not.toHaveProperty('x-sig');
      expect(dispatcher.list()[0]?.notes).toEqual(['delayed', 'unsigned']);
    });

    it('validates fault settings', () => {
      const { dispatcher } = setup();
      expect(() => dispatcher.setFaults({ duplicateRate: 2 })).toThrow(RangeError);
      expect(() => dispatcher.setFaults({ delayMs: -1 })).toThrow(RangeError);
      expect(dispatcher.setFaults({ delayMs: 10_000 }).delayMs).toBe(10_000);
    });
  });

  it('fails deliveries whose target was removed', async () => {
    const { dispatcher, targets, event } = setup();
    const [delivery] = dispatcher.enqueue(event());
    targets.length = 0;
    await dispatcher.tick();
    expect(dispatcher.get(delivery?.id ?? '')).toMatchObject({ status: 'failed', attempts: [{ error: 'webhook target was removed' }] });
  });

  it('notifies listeners and trims finished deliveries beyond maxLog', async () => {
    const { dispatcher, event } = setup({ maxLog: 2 });
    const seen: string[] = [];
    dispatcher.subscribe((d) => seen.push(d.status));
    for (let i = 0; i < 3; i++) dispatcher.enqueue(event());
    await dispatcher.tick();
    dispatcher.enqueue(event());
    expect(dispatcher.list()).toHaveLength(2);
    expect(seen).toContain('delivered');
  });

  it('also sends deliveries enqueued while a tick is running', async () => {
    const { dispatcher, sent, event } = setup();
    dispatcher.enqueue(event());
    const running = dispatcher.tick();
    dispatcher.enqueue(event());
    expect(await running).toBe(2);
    expect(sent).toHaveLength(2);
  });

  it('does not run two ticks at once', async () => {
    const { dispatcher, sent, event } = setup();
    dispatcher.enqueue(event());
    await Promise.all([dispatcher.tick(), dispatcher.tick()]);
    expect(sent).toHaveLength(1);
  });
});
