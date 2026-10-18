// The event loop of the engine: append, apply, notify. Also replays a persisted log.
import { createManualClock, systemClock, type Clock, type ControllableClock } from '../clock/index.ts';
import type { AnyEvent, EventMap, EventType, LocalPayEvent } from '../events/types.ts';
import { createMemoryEventStore, type EventStore } from '../events/store.ts';
import { createIdGenerator } from '../ids/index.ts';
import { createRandom, type Random } from '../random/index.ts';
import { applyEvent, clearState, createState, type State } from '../state/index.ts';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig, type EngineContext } from './context.ts';

export interface EngineOptions {
  clock?: Clock | ControllableClock;
  /** Seed for ids and any randomness. Same seed + same calls = same output. */
  seed?: string | number;
  random?: Random;
  store?: EventStore;
  config?: Partial<EngineConfig>;
}

export type EventListener = (event: AnyEvent) => void;

export interface EngineBase extends EngineContext {
  readonly clock: Clock;
  readonly random: Random;
  /** The full log, oldest first. Do not mutate. */
  readonly events: readonly AnyEvent[];
  subscribe(listener: EventListener): () => void;
  /** Called after reset() clears all data. */
  onReset(listener: () => void): () => void;
  reset(): void;
}

const hasId = (value: unknown): value is { id: string } =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';

/** A frozen clock is the default for seeded runs, so a seed replays identically. */
const SEEDED_EPOCH_MS = Date.UTC(2026, 0, 1);

export function createEngineBase(options: EngineOptions = {}): EngineBase {
  const clock = options.clock ?? (options.seed !== undefined ? createManualClock(SEEDED_EPOCH_MS) : systemClock);
  const random = options.random ?? createRandom(options.seed);
  const store = options.store ?? createMemoryEventStore();
  const config: EngineConfig = { ...DEFAULT_ENGINE_CONFIG, ...options.config };
  const ids = createIdGenerator(random);
  const state: State = createState();
  const events: AnyEvent[] = [];
  const listeners = new Set<EventListener>();
  const resetListeners = new Set<() => void>();

  const reserveIds = (event: AnyEvent): void => {
    ids.reserve(event.id);
    for (const value of Object.values(event.data) as unknown[]) {
      if (hasId(value)) ids.reserve(value.id);
    }
  };

  for (const event of store.load()) {
    events.push(event);
    applyEvent(state, event);
    reserveIds(event);
  }

  const engine: EngineBase = {
    state,
    config,
    clock,
    random,
    events,
    now: () => Math.floor(clock.now() / 1000),
    newId: (prefix) => ids.next(prefix),
    emit<K extends EventType>(type: K, data: EventMap[K]): LocalPayEvent<K> {
      const event = { seq: events.length + 1, id: ids.next('evt'), type, at: clock.now(), data } as LocalPayEvent<K>;
      const any = event as unknown as AnyEvent;
      store.append(any);
      events.push(any);
      applyEvent(state, any);
      for (const listener of listeners) listener(any);
      return event;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onReset(listener) {
      resetListeners.add(listener);
      return () => resetListeners.delete(listener);
    },
    reset() {
      store.clear();
      events.length = 0;
      clearState(state);
      for (const listener of resetListeners) listener();
    },
  };
  return engine;
}
