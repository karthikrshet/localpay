import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdminAuth } from './auth.ts';
import { dashboard } from './dashboard.ts';

const dir = mkdtempSync(join(tmpdir(), 'lp-dash-'));
mkdirSync(join(dir, 'assets'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const setup = async (password: string | null = null, dashboardDir: string | null = dir) => {
  const app = Fastify();
  const auth = createAdminAuth(password, 'tok');
  await app.register(dashboard, { auth, dashboardDir });
  return app;
};

describe('dashboard serving', () => {
  it('moves the token from the URL into a cookie and redirects', async () => {
    const app = await setup();
    const response = await app.inject({ url: '/webhooks?token=tok' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/webhooks');
    expect(response.headers['set-cookie']).toBe('lp_session=tok; HttpOnly; SameSite=Strict; Path=/');
  });

  it('serves the SPA with strict security headers once signed in', async () => {
    const app = await setup();
    const response = await app.inject({ url: '/orders/order_X', headers: { cookie: 'lp_session=tok' } });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('id="root"');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('shows a locked page without a valid session, and never reflects a wrong token', async () => {
    const app = await setup();
    const response = await app.inject({ url: '/?token=wrong' });
    expect(response.statusCode).toBe(401);
    expect(response.body).toContain('printed in your terminal');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('serves built assets', async () => {
    const app = await setup();
    const response = await app.inject({ url: '/assets/app.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('supports password sign-in when a dashboard password is set', async () => {
    const app = await setup('hunter2');
    expect((await app.inject({ url: '/' })).body).toContain('type="password"');
    const wrong = await app.inject({ method: 'POST', url: '/_localpay/login', payload: 'password=nope', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(wrong.statusCode).toBe(401);
    const right = await app.inject({ method: 'POST', url: '/_localpay/login', payload: 'password=hunter2', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(right.statusCode).toBe(302);
    expect(right.headers['set-cookie']).toContain('lp_session=tok');
  });

  it('explains when the dashboard has not been built', async () => {
    const app = await setup(null, null);
    const response = await app.inject({ url: '/', headers: { cookie: 'lp_session=tok' } });
    expect(response.statusCode).toBe(503);
    expect(response.body).toContain('Dashboard not built');
  });
});
