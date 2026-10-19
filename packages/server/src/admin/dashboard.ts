// Serves the dashboard SPA behind the session cookie, with strict security headers.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { checkAdminRequest, sessionCookie, type AdminAuth } from './auth.ts';

export interface DashboardOptions {
  auth: AdminAuth;
  /** Built dashboard (index.html + assets/). Null when not built. */
  dashboardDir: string | null;
}

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

/** The SPA's client-side routes; all of them serve index.html. */
export const DASHBOARD_ROUTES = ['/', '/orders', '/orders/:id', '/payments', '/payments/:id', '/links', '/subscriptions', '/settlements', '/webhooks', '/scenarios', '/time', '/settings'];

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · LocalPay</title></head>
<body style="font:16px system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 16px;color:#0F172A">${body}</body></html>`;

// The inline style above is allowed by a per-response CSP that adds 'unsafe-inline' for styles only.
const LOCKED_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function sendPage(reply: FastifyReply, status: number, html: string): FastifyReply {
  return reply.code(status).headers({ ...SECURITY_HEADERS, 'content-security-policy': LOCKED_CSP }).type('text/html; charset=utf-8').send(html);
}

export const dashboard: FastifyPluginAsync<DashboardOptions> = async (app, { auth, dashboardDir }) => {
  const built = dashboardDir !== null && existsSync(join(dashboardDir, 'index.html'));
  if (built) await app.register(fastifyStatic, { root: join(dashboardDir, 'assets'), prefix: '/assets/', decorateReply: false, setHeaders: (reply) => void reply.header('x-content-type-options', 'nosniff') });

  const locked = (reply: FastifyReply) =>
    auth.password
      ? sendPage(reply, 401, page('Sign in', `<h1>LocalPay dashboard</h1><form method="post" action="/_localpay/login"><label>Password <input type="password" name="password" autocomplete="current-password" required></label> <button>Sign in</button></form>`))
      : sendPage(reply, 401, page('Locked', '<h1>LocalPay dashboard</h1><p>Open the dashboard link printed in your terminal by <code>localpay start</code>. It contains a one-time session token.</p>'));

  for (const route of DASHBOARD_ROUTES) {
    app.get<{ Querystring: { token?: string } }>(route, async (request, reply) => {
      if (request.query.token !== undefined) {
        if (request.query.token !== auth.token) return locked(reply);
        // Move the token from the URL into a cookie, then drop it from the address bar.
        return reply.code(302).headers({ ...SECURITY_HEADERS, 'set-cookie': sessionCookie(auth.token), location: request.url.split('?')[0] ?? '/' }).send();
      }
      if (checkAdminRequest(request, auth) !== 'ok') return locked(reply);
      if (!built) return sendPage(reply, 503, page('Not built', '<h1>Dashboard not built</h1><p>Run <code>pnpm --filter @localpay/dashboard build</code>. The API is running.</p>'));
      return reply.headers(SECURITY_HEADERS).type('text/html; charset=utf-8').send(await readFile(join(dashboardDir, 'index.html'), 'utf8'));
    });
  }

  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  app.post('/_localpay/login', (request, reply) => {
    const parsed = z.object({ password: z.string() }).safeParse(request.body);
    if (!auth.password || !parsed.success || parsed.data.password !== auth.password) return locked(reply);
    return reply.code(302).headers({ ...SECURITY_HEADERS, 'set-cookie': sessionCookie(auth.token), location: '/' }).send();
  });
};
