// Entity IDs: prefix + "_" + 14 base62 characters, e.g. order_Kx81f0Pq2LmZ7a.
// All IDs in LocalPay come from here; never build one inline.
import type { Random } from '../random/index.ts';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const ID_BODY_LENGTH = 14;

export interface IdGenerator {
  /** Returns a new ID such as `pay_29QQoUBi66xm2f`. Never returns one passed to `reserve`. */
  next(prefix: string): string;
  /** Marks an existing ID as taken (used when replaying a persisted event log). */
  reserve(id: string): void;
}

export function createIdGenerator(random: Random): IdGenerator {
  const taken = new Set<string>();
  return {
    next(prefix) {
      if (!/^[a-z]+$/.test(prefix)) throw new Error(`invalid id prefix "${prefix}"`);
      for (;;) {
        let body = '';
        for (let i = 0; i < ID_BODY_LENGTH; i++) body += ALPHABET[random.int(ALPHABET.length)];
        const id = `${prefix}_${body}`;
        if (!taken.has(id)) {
          taken.add(id);
          return id;
        }
      }
    },
    reserve(id) {
      taken.add(id);
    },
  };
}

export function isId(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && new RegExp(`^${prefix}_[0-9A-Za-z]{${ID_BODY_LENGTH}}$`).test(value);
}
