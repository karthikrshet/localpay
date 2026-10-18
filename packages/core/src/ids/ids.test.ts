import { describe, expect, it } from 'vitest';
import { createRandom } from '../random/index.ts';
import { createIdGenerator, isId } from './index.ts';

describe('createIdGenerator', () => {
  it('produces prefix + 14 base62 characters', () => {
    const ids = createIdGenerator(createRandom('x'));
    const id = ids.next('order');
    expect(id).toMatch(/^order_[0-9A-Za-z]{14}$/);
    expect(isId(id, 'order')).toBe(true);
    expect(isId(id, 'pay')).toBe(false);
  });

  it('is deterministic for a seed', () => {
    const a = createIdGenerator(createRandom(7));
    const b = createIdGenerator(createRandom(7));
    expect([a.next('pay'), a.next('pay')]).toEqual([b.next('pay'), b.next('pay')]);
  });

  it('never repeats a reserved id', () => {
    const first = createIdGenerator(createRandom(7)).next('pay');
    const ids = createIdGenerator(createRandom(7));
    ids.reserve(first);
    expect(ids.next('pay')).not.toBe(first);
  });

  it('rejects malformed prefixes', () => {
    expect(() => createIdGenerator(createRandom(1)).next('Pay_')).toThrow(/invalid id prefix/);
  });

  it('does not collide across many ids', () => {
    const ids = createIdGenerator(createRandom());
    const seen = new Set(Array.from({ length: 5000 }, () => ids.next('rfnd')));
    expect(seen.size).toBe(5000);
  });
});
