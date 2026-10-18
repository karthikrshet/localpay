import { describe, expect, it } from 'vitest';
import { checkAdminRequest, createAdminAuth, CSRF_HEADER, parseCookies, sessionCookie } from './auth.ts';

const auth = createAdminAuth(null, 'tok123');
const req = (method: string, headers: Record<string, string> = {}) => ({ method, headers });

describe('admin auth', () => {
  it('derives a stable CSRF token that differs from the session token', () => {
    expect(createAdminAuth(null, 'tok123').csrf).toBe(auth.csrf);
    expect(auth.csrf).not.toBe(auth.token);
    expect(createAdminAuth().token).toMatch(/^[0-9a-f]{48}$/);
  });

  it('sets an HttpOnly SameSite=Strict cookie', () => {
    expect(sessionCookie('x')).toBe('lp_session=x; HttpOnly; SameSite=Strict; Path=/');
  });

  it('parses cookies', () => {
    expect(parseCookies('a=1; lp_session=tok%31; b')).toEqual({ a: '1', lp_session: 'tok1' });
  });

  it('accepts reads with the session cookie and rejects without it', () => {
    expect(checkAdminRequest(req('GET', { cookie: 'lp_session=tok123' }), auth)).toBe('ok');
    expect(checkAdminRequest(req('GET', { cookie: 'lp_session=nope' }), auth)).toBe('unauthenticated');
    expect(checkAdminRequest(req('GET'), auth)).toBe('unauthenticated');
  });

  it('requires the CSRF header and same origin for cookie mutations', () => {
    const cookie = 'lp_session=tok123';
    expect(checkAdminRequest(req('POST', { cookie }), auth)).toBe('forbidden');
    expect(checkAdminRequest(req('POST', { cookie, [CSRF_HEADER]: auth.csrf, host: '127.0.0.1:4010', origin: 'http://127.0.0.1:4010' }), auth)).toBe('ok');
    expect(checkAdminRequest(req('POST', { cookie, [CSRF_HEADER]: auth.csrf, host: '127.0.0.1:4010', origin: 'http://evil.example' }), auth)).toBe('forbidden');
  });

  it('accepts the CLI bearer token without CSRF', () => {
    expect(checkAdminRequest(req('POST', { authorization: 'Bearer tok123' }), auth)).toBe('ok');
    expect(checkAdminRequest(req('POST', { authorization: 'Bearer wrong' }), auth)).toBe('unauthenticated');
  });
});
