// Who may use the dashboard API. A random session token is printed at start-up;
// opening the printed link stores it in an HttpOnly, SameSite=Strict cookie. Mutations
// also need a CSRF header. The CLI sends the token as a Bearer header instead.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'lp_session';
export const CSRF_HEADER = 'x-localpay-csrf';

export interface AdminAuth {
  /** Secret session token. Treat like a password. */
  readonly token: string;
  /** Derived CSRF token, safe to hand to the page. */
  readonly csrf: string;
  readonly password: string | null;
}

export function createAdminAuth(password: string | null = null, token: string = randomBytes(24).toString('hex')): AdminAuth {
  return { token, csrf: createHmac('sha256', token).update('csrf').digest('hex'), password };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

const same = (a: string | undefined, b: string): boolean => {
  if (a === undefined) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

export type AuthCheck = 'ok' | 'unauthenticated' | 'forbidden';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Checks a dashboard API request. */
export function checkAdminRequest(request: Pick<FastifyRequest, 'headers' | 'method'>, auth: AdminAuth): AuthCheck {
  const bearer = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (bearer !== undefined) return same(bearer, auth.token) ? 'ok' : 'unauthenticated';

  if (!same(parseCookies(request.headers.cookie)[SESSION_COOKIE], auth.token)) return 'unauthenticated';
  if (SAFE_METHODS.has(request.method)) return 'ok';

  // Cookie-authenticated mutation: must carry the CSRF token and come from this origin.
  const csrf = request.headers[CSRF_HEADER];
  if (!same(typeof csrf === 'string' ? csrf : undefined, auth.csrf)) return 'forbidden';
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin && host && new URL(origin).host !== host) return 'forbidden';
  return 'ok';
}
