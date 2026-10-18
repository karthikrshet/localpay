// Billing period arithmetic on Unix seconds, in UTC. Months are calendar months:
// Jan 31 + 1 month = Feb 28 (or 29), like most billing systems.
import type { PlanPeriod, UnixSeconds } from '../entities/index.ts';

const DAY = 86_400;

function addMonths(at: UnixSeconds, months: number): UnixSeconds {
  const date = new Date(at * 1000);
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return Math.floor(target.getTime() / 1000);
}

export function addPeriod(at: UnixSeconds, period: PlanPeriod, interval: number): UnixSeconds {
  switch (period) {
    case 'daily':
      return at + DAY * interval;
    case 'weekly':
      return at + 7 * DAY * interval;
    case 'monthly':
      return addMonths(at, interval);
    case 'yearly':
      return addMonths(at, 12 * interval);
  }
}
