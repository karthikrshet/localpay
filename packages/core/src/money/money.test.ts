import { describe, expect, it } from 'vitest';
import { applyBps, computeFee, formatAmount, isPaise } from './index.ts';

describe('money', () => {
  it('accepts only non-negative safe integers as paise', () => {
    expect(isPaise(100)).toBe(true);
    expect(isPaise(0)).toBe(true);
    expect(isPaise(100.5)).toBe(false);
    expect(isPaise(-1)).toBe(false);
    expect(isPaise('100')).toBe(false);
    expect(isPaise(2 ** 60)).toBe(false);
  });

  it('applies basis points with rounding', () => {
    expect(applyBps(50000, 200)).toBe(1000);
    expect(applyBps(125, 200)).toBe(3); // 2.5 rounds up
  });

  it('computes fee including 18% tax on a 2% fee', () => {
    // ₹500.00 → fee 1000 paise + tax 180 paise
    expect(computeFee(50000)).toEqual({ fee: 1180, tax: 180 });
  });

  it('formats amounts for display', () => {
    expect(formatAmount(50000)).toBe('500.00');
    expect(formatAmount(10013)).toBe('100.13');
    expect(formatAmount(5)).toBe('0.05');
  });
});
