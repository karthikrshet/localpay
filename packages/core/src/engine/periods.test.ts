import { describe, expect, it } from 'vitest';
import { addPeriod } from './periods.ts';

const at = (iso: string) => Date.parse(iso) / 1000;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

describe('addPeriod', () => {
  it('adds days and weeks', () => {
    expect(iso(addPeriod(at('2026-01-01T10:00:00Z'), 'daily', 7))).toBe('2026-01-08T10:00:00.000Z');
    expect(iso(addPeriod(at('2026-01-01T10:00:00Z'), 'weekly', 2))).toBe('2026-01-15T10:00:00.000Z');
  });

  it('adds calendar months, clamping to the end of shorter months', () => {
    expect(iso(addPeriod(at('2026-01-31T09:30:00Z'), 'monthly', 1))).toBe('2026-02-28T09:30:00.000Z');
    expect(iso(addPeriod(at('2028-01-31T00:00:00Z'), 'monthly', 1))).toBe('2028-02-29T00:00:00.000Z');
    expect(iso(addPeriod(at('2026-11-15T00:00:00Z'), 'monthly', 3))).toBe('2027-02-15T00:00:00.000Z');
  });

  it('adds years, including from a leap day', () => {
    expect(iso(addPeriod(at('2028-02-29T00:00:00Z'), 'yearly', 1))).toBe('2029-02-28T00:00:00.000Z');
  });
});
