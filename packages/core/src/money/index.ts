// Money is always an integer number of the smallest currency unit. Never floats.
import type { Paise } from '../entities/index.ts';

export function isPaise(value: unknown): value is Paise {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** basis points: 200 bps = 2%. Rounds half up, like a fee schedule. */
export function applyBps(amount: Paise, bps: number): Paise {
  return Math.round((amount * bps) / 10_000);
}

export interface FeeSchedule {
  /** Gateway fee rate in basis points (200 = 2%). */
  feeBps: number;
  /** Tax on the fee in basis points (1800 = 18% GST). */
  taxBps: number;
}

export const DEFAULT_FEES: FeeSchedule = { feeBps: 200, taxBps: 1800 };

/** Returns the total fee (including tax) and the tax part, both in paise. */
export function computeFee(amount: Paise, schedule: FeeSchedule = DEFAULT_FEES): { fee: Paise; tax: Paise } {
  const base = applyBps(amount, schedule.feeBps);
  const tax = applyBps(base, schedule.taxBps);
  return { fee: base + tax, tax };
}

/** Formats paise as a human amount, e.g. 50000 → "500.00". For display only. */
export function formatAmount(amount: Paise): string {
  const rupees = Math.trunc(amount / 100);
  const paise = Math.abs(amount % 100);
  return `${rupees}.${String(paise).padStart(2, '0')}`;
}
