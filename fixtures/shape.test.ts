import { describe, expect, it } from 'vitest';
import { compareShapes } from './shape.ts';

describe('compareShapes', () => {
  it('ignores values but not types', () => {
    expect(compareShapes({ id: 'a', n: 1 }, { id: 'b', n: 2 })).toEqual([]);
    expect(compareShapes({ n: 1 }, { n: '1' })).toEqual(['$.n: expected number, got string']);
  });

  it('reports missing and extra keys', () => {
    expect(compareShapes({ a: 1, b: 2 }, { a: 1, c: 3 })).toEqual(['$.b: missing in LocalPay', '$.c: not in the recorded response']);
  });

  it('treats null as matching anything', () => {
    expect(compareShapes({ a: null, b: 'x' }, { a: 'x', b: null })).toEqual([]);
  });

  it('compares the first element of arrays, recursively', () => {
    expect(compareShapes({ items: [{ id: 'x', amount: 1 }] }, { items: [{ id: 'y' }] })).toEqual(['$.items[0].amount: missing in LocalPay']);
    expect(compareShapes({ items: [] }, { items: [{ id: 'y' }] })).toEqual([]);
  });

  it('accepts [] and {} interchangeably for notes-like fields', () => {
    expect(compareShapes({ notes: [] }, { notes: { a: 1 } })).toEqual([]);
  });
});
