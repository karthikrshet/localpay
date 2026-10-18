import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { httpSender, isSuccess, MAX_LOGGED_RESPONSE } from './sender.ts';

let server: Server | null = null;
const listen = async (handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> => {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
afterEach(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = null;
});

describe('httpSender', () => {
  it('POSTs the exact body with the given headers', async () => {
    let seen: { method?: string; headers?: IncomingMessage['headers']; body?: string } = {};
    const url = await listen((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        seen = { method: req.method, headers: req.headers, body };
        res.writeHead(200).end('ok');
      });
    });
    const result = await httpSender({ url: `${url}/hook`, headers: { 'x-razorpay-signature': 'sig' }, body: '{"a":1}' });
    expect(result).toMatchObject({ statusCode: 200, responseBody: 'ok' });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(seen).toMatchObject({ method: 'POST', body: '{"a":1}', headers: { 'x-razorpay-signature': 'sig' } });
  });

  it('does not follow redirects', async () => {
    const url = await listen((_req, res) => res.writeHead(302, { location: 'http://169.254.169.254/' }).end());
    const result = await httpSender({ url, headers: {}, body: '{}' });
    expect(result.statusCode).toBe(302);
    expect(isSuccess(result.statusCode)).toBe(false);
  });

  it('times out slow targets', async () => {
    const url = await listen(() => undefined);
    await expect(httpSender({ url, headers: {}, body: '{}', timeoutMs: 100 })).rejects.toThrow(/timed out after 100ms/);
  });

  it('truncates large responses for the log', async () => {
    const url = await listen((_req, res) => res.writeHead(500).end('x'.repeat(MAX_LOGGED_RESPONSE * 3)));
    expect((await httpSender({ url, headers: {}, body: '{}' })).responseBody).toHaveLength(MAX_LOGGED_RESPONSE);
  });

  it('refuses blocked targets before connecting', async () => {
    await expect(httpSender({ url: 'http://169.254.169.254/latest', headers: {}, body: '{}' })).rejects.toThrow(/blocked/);
  });
});
