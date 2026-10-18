import { describe, expect, it } from 'vitest';
import { createRandom, hashSeed } from './index.ts';

describe('createRandom', () => {
  it('replays the same sequence for the same seed', () => {
    const a = createRandom('seed-1');
    const b = createRandom('seed-1');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    expect(createRandom(1).next()).not.toBe(createRandom(2).next());
  });

  it('keeps next() in [0, 1) and int() in [0, max)', () => {
    for (const r of [createRandom(42), createRandom()]) {
      for (let i = 0; i < 1000; i++) {
        const n = r.next();
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
        const k = r.int(7);
        expect(Number.isInteger(k) && k >= 0 && k < 7).toBe(true);
      }
    }
  });

  it('treats numeric and string seeds by their string form', () => {
    expect(hashSeed(123)).toBe(hashSeed('123'));
  });
});
