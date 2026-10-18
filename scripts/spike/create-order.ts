// Phase 0 spike: point the official razorpay Node SDK at a local server and create an order.
// Run: pnpm spike
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import Razorpay from 'razorpay';
import { startServer, type SeenRequest } from './server.ts';

// The SDK hard-codes https://api.razorpay.com and has no host option, but every
// resource call goes through `api.rq`, a public axios instance. `rq` is not in the
// SDK's type definitions, hence the narrow cast.
interface WithAxios { api: { rq: { defaults: { baseURL?: string } } } }

export function pointAt(client: Razorpay, host: string): void {
  (client as unknown as WithAxios).api.rq.defaults.baseURL = host;
}

export async function runSpike(port = 0) {
  const seen: SeenRequest[] = [];
  const server = await startServer(port, seen);
  const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const client = new Razorpay({ key_id: 'rzp_test_spike', key_secret: 'spike_secret' });
    const defaultHost = (client as unknown as WithAxios).api.rq.defaults.baseURL;
    pointAt(client, host); // note: host only; the SDK adds /v1 itself
    const order = await client.orders.create({ amount: 50000, currency: 'INR', receipt: 'spike-1', notes: { purpose: 'phase-0' } });
    return { defaultHost, host, order, seen };
  } finally {
    server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { defaultHost, host, order, seen } = await runSpike(Number(process.env.PORT ?? 4010));
  console.log(`SDK default host : ${defaultHost}`);
  console.log(`Overridden to    : ${host}`);
  for (const r of seen) {
    const user = Buffer.from(r.authorization.replace(/^Basic /, ''), 'base64').toString().split(':')[0];
    console.log(`Server saw       : ${r.method} ${r.url} (Basic auth user: ${user}) body=${r.body}`);
  }
  console.log('Order returned   :', order);
}
