import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine, createFileEventStore } from '@localpay/core';
import { verifyWebhookSignature } from '@localpay/provider-razorpay';
import type { SendRequest } from '@localpay/webhooks';
import { afterAll, describe, expect, it } from 'vitest';
import { loadRecording, replayEvents } from './replay.ts';

const dir = mkdtempSync(join(tmpdir(), 'lp-replay-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const record = () => {
  const file = join(dir, `session-${Math.random().toString(36).slice(2)}.jsonl`);
  const engine = createEngine({ seed: 'recorded', store: createFileEventStore(file) });
  const order = engine.createOrder({ amount: 50000 });
  engine.attemptPayment({ orderId: order.id, method: 'upi', outcome: { kind: 'success' } });
  return { file, engine };
};

describe('replayEvents', () => {
  it('re-sends recorded webhooks in order, signed, with the original event ids', async () => {
    const { file, engine } = record();
    const sent: SendRequest[] = [];
    const result = await replayEvents(loadRecording(file), {
      url: 'http://127.0.0.1:3000/webhooks',
      secret: 'whsec',
      send: (request) => {
        sent.push(request);
        return Promise.resolve({ statusCode: 200, responseBody: 'ok', latencyMs: 1 });
      },
    });
    expect(result).toMatchObject({ total: 3, delivered: 3, failed: [] });
    expect(sent.map((s) => (JSON.parse(s.body) as { event: string }).event)).toEqual(['payment.authorized', 'payment.captured', 'order.paid']);
    const recordedIds = engine.events.filter((e) => ['payment.authorized', 'payment.captured', 'order.paid'].includes(e.type)).map((e) => e.id);
    expect(sent.map((s) => s.headers['X-Razorpay-Event-Id'])).toEqual(recordedIds);
    for (const s of sent) expect(verifyWebhookSignature(s.body, s.headers['X-Razorpay-Signature'] ?? '', 'whsec')).toBe(true);
  });

  it('reports failures without retrying and can filter events', async () => {
    const { file } = record();
    const result = await replayEvents(loadRecording(file), {
      url: 'http://127.0.0.1:3000/webhooks',
      secret: 's',
      events: ['order.paid'],
      send: () => Promise.resolve({ statusCode: 500, responseBody: 'boom', latencyMs: 1 }),
    });
    expect(result).toMatchObject({ total: 1, delivered: 0 });
    expect(result.failed[0]).toMatchObject({ event: 'order.paid', status: 'failed', attempts: [{ statusCode: 500 }] });
  });
});
