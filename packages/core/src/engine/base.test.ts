import { describe, expect, it } from 'vitest';
import { createManualClock } from '../clock/index.ts';
import type { Order } from '../entities/index.ts';
import { createMemoryEventStore } from '../events/store.ts';
import type { AnyEvent } from '../events/types.ts';
import { createEngineBase } from './base.ts';

const order = (id: string): Order => ({
  id, amount: 100, amountPaid: 0, currency: 'INR', receipt: null, notes: {},
  status: 'created', attempts: 0, partialPayment: false, autoCapture: null, createdAt: 0,
});

describe('engine base', () => {
  it('records, applies and broadcasts events in order', () => {
    const engine = createEngineBase({ seed: 1 });
    const seen: AnyEvent[] = [];
    engine.subscribe((e) => seen.push(e));
    const event = engine.emit('order.created', { order: order('order_AAAAAAAAAAAAAA') });
    expect(event.seq).toBe(1);
    expect(event.id).toMatch(/^evt_[0-9A-Za-z]{14}$/);
    expect(engine.events).toHaveLength(1);
    expect(engine.state.orders.has('order_AAAAAAAAAAAAAA')).toBe(true);
    expect(seen).toEqual([event]);
  });

  it('uses a frozen clock for seeded runs so output is reproducible', () => {
    const a = createEngineBase({ seed: 'same' });
    const b = createEngineBase({ seed: 'same' });
    expect(a.emit('order.created', { order: order(a.newId('order')) })).toEqual(b.emit('order.created', { order: order(b.newId('order')) }));
  });

  it('reports time in Unix seconds from the injected clock', () => {
    const engine = createEngineBase({ clock: createManualClock(1_760_800_000_500) });
    expect(engine.now()).toBe(1_760_800_000);
  });

  it('replays a persisted log and never reuses its ids', () => {
    const store = createMemoryEventStore();
    const first = createEngineBase({ seed: 9, store });
    const id = first.newId('order');
    first.emit('order.created', { order: order(id) });

    const second = createEngineBase({ seed: 9, store });
    expect(second.state.orders.get(id)?.id).toBe(id);
    expect(second.newId('order')).not.toBe(id);
    expect(second.emit('order.created', { order: order('order_BBBBBBBBBBBBBB') }).seq).toBe(2);
  });

  it('reset() clears log, state and store, and notifies', () => {
    const store = createMemoryEventStore();
    const engine = createEngineBase({ store });
    let resets = 0;
    engine.onReset(() => resets++);
    engine.emit('order.created', { order: order('order_AAAAAAAAAAAAAA') });
    engine.reset();
    expect(engine.events).toHaveLength(0);
    expect(engine.state.orders.size).toBe(0);
    expect(store.load()).toEqual([]);
    expect(resets).toBe(1);
  });

  it('stops notifying after unsubscribe', () => {
    const engine = createEngineBase();
    let calls = 0;
    const off = engine.subscribe(() => calls++);
    off();
    engine.emit('clock.advanced', { from: 0, to: 1 });
    expect(calls).toBe(0);
  });
});
