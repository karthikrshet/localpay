// Deterministic pseudo-random numbers. With a seed, every run replays identically;
// without one, values come from the OS CSPRNG.
import { randomInt } from 'node:crypto';

export interface Random {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, max). */
  int(max: number): number;
}

/** FNV-1a 32-bit hash, used to turn any seed into a 32-bit state. */
export function hashSeed(seed: string | number): number {
  let h = 0x811c9dc5;
  for (const ch of String(seed)) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRandom(seed?: string | number): Random {
  if (seed === undefined) {
    return {
      next: () => randomInt(0, 2 ** 32) / 2 ** 32,
      int: (max) => randomInt(0, max),
    };
  }
  // mulberry32: small, fast, good enough for test data (not for secrets).
  let state = hashSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  return { next, int: (max) => Math.floor(next() * max) };
}
