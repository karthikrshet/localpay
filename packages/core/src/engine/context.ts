// What every engine operation needs: current state, the clock, ids, config and emit().
import type { RefundSpeed, UnixSeconds } from '../entities/index.ts';
import type { EventMap, EventType, LocalPayEvent } from '../events/types.ts';
import type { FeeSchedule } from '../money/index.ts';
import type { State } from '../state/index.ts';

export interface EngineConfig {
  /** Capture successful payments immediately unless the order says otherwise. */
  autoCapture: boolean;
  fees: FeeSchedule;
  /** Seconds a refund stays pending before it is processed, by requested speed. */
  refundDelaySeconds: Record<RefundSpeed, number>;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  autoCapture: true,
  fees: { feeBps: 200, taxBps: 1800 },
  refundDelaySeconds: { normal: 5, optimum: 1 },
};

export interface EngineContext {
  readonly state: State;
  readonly config: EngineConfig;
  /** Emulator time in Unix seconds. */
  now(): UnixSeconds;
  newId(prefix: string): string;
  /** Records an event, applies it to state and notifies listeners — in that order. */
  emit<K extends EventType>(type: K, data: EventMap[K]): LocalPayEvent<K>;
}
