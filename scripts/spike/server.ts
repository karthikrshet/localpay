// Phase 0 spike: the smallest server that answers POST /v1/orders like Razorpay.
// Throwaway code. It lives outside packages/ so the core rules (clock, ids) do not apply.
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';

export interface SeenRequest { method: string; url: string; authorization: string; body: string }

export function startServer(port: number, seen: SeenRequest[] = []): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization ?? '', body });
      const ok = req.method === 'POST' && req.url === '/v1/orders';
      const input = ok ? (JSON.parse(body) as { amount: number; currency: string; receipt?: string; notes?: object }) : null;
      const order = input && { id: `order_${randomBytes(7).toString('hex')}`, entity: 'order', amount: input.amount, amount_paid: 0, amount_due: input.amount, currency: input.currency, receipt: input.receipt ?? null, offer_id: null, status: 'created', attempts: 0, notes: input.notes ?? [], created_at: Math.floor(Date.now() / 1000) };
      res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' });
      res.end(JSON.stringify(order ?? { error: { code: 'BAD_REQUEST_ERROR', description: 'The requested URL was not found on the server.' } }));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
