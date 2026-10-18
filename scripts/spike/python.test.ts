// Phase 0: the official Python SDK creates an order against localhost via base_url.
// Runs only when LOCALPAY_PYTHON points at a Python with `razorpay` installed (CI sets it).
import { execFile } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { startServer, type SeenRequest } from './server.ts';

const python = process.env.LOCALPAY_PYTHON;
const script = fileURLToPath(new URL('./python/create_order.py', import.meta.url));

describe.skipIf(!python)('razorpay Python SDK base_url option', () => {
  it('creates an order against the local server', async () => {
    const seen: SeenRequest[] = [];
    const server = await startServer(0, seen);
    try {
      const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const { stdout } = await promisify(execFile)(python ?? '', [script, host]);
      const order = JSON.parse(stdout) as Record<string, unknown>;
      expect(order).toMatchObject({ entity: 'order', amount: 50000, currency: 'INR', status: 'created' });
      expect(seen[0]?.url).toBe('/v1/orders');
      expect(Buffer.from((seen[0]?.authorization ?? '').replace(/^Basic /, ''), 'base64').toString()).toBe('rzp_test_spike:spike_secret');
    } finally {
      server.close();
    }
  });
});
