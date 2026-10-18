// The only place in LocalPay that reads the wall clock. Everything else asks a Clock,
// which lets tests freeze time and lets users fast-forward days.

export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}

export interface ControllableClock extends Clock {
  /** Moves time forward. Time never goes backwards: events must stay ordered. */
  advance(ms: number): void;
  /** Jumps to an absolute time that is not before now(). */
  set(ms: number): void;
  /** How far this clock is ahead of real time (0 for a manual clock's own baseline). */
  offset(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

function checkForward(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError('time can only move forward');
}

/** A frozen clock that only moves when told to. Use for deterministic runs. */
export function createManualClock(startMs: number): ControllableClock {
  let current = startMs;
  return {
    now: () => current,
    advance(ms) {
      checkForward(ms);
      current += ms;
    },
    set(ms) {
      checkForward(ms - current);
      current = ms;
    },
    offset: () => current - startMs,
  };
}

/** Real time plus an offset. Use for a running server that supports time travel. */
export function createOffsetClock(base: Clock = systemClock): ControllableClock {
  let offset = 0;
  return {
    now: () => base.now() + offset,
    advance(ms) {
      checkForward(ms);
      offset += ms;
    },
    set(ms) {
      checkForward(ms - (base.now() + offset));
      offset = ms - base.now();
    },
    offset: () => offset,
  };
}

export function unixSeconds(clock: Clock): number {
  return Math.floor(clock.now() / 1000);
}

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** Parses durations such as "45s", "30m", "2h", "3d", "1w" or "1d12h" into milliseconds. */
export function parseDuration(text: string): number {
  const trimmed = text.trim();
  if (!/^(?:\d+[smhdw])+$/.test(trimmed)) throw new RangeError(`invalid duration "${text}" (use e.g. 45s, 30m, 2h, 3d, 1w)`);
  return (trimmed.match(/\d+[smhdw]/g) ?? []).reduce((total, part) => total + Number(part.slice(0, -1)) * (UNIT_MS[part.slice(-1)] ?? 0), 0);
}
