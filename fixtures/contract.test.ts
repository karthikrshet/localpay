// Contract tests: replay fixtures/requests/core.json against LocalPay, in order, and compare
// each response with fixtures/razorpay/<name>.json. Recorded fixtures are compared strictly;
// hand-written ones (until real recordings replace them) by status and shape only.
import { readdirSync, readFileSync } from 'node:fs';
import { createLocalPay, DEMO_KEY, type LocalPay } from '@localpay/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MissingReference, resolveBody, resolveTemplate, type Fixture, type RequestSpec } from '../scripts/record-fixtures.ts';
import { compareShapes } from './shape.ts';

const dir = new URL('./razorpay/', import.meta.url);
const specs = JSON.parse(readFileSync(new URL('./requests/core.json', import.meta.url), 'utf8')) as RequestSpec[];
const fixtures = new Map(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const fixture = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Fixture;
      return [fixture.name, fixture] as const;
    }),
);

const AUTH = `Basic ${Buffer.from(`${DEMO_KEY.keyId}:${DEMO_KEY.keySecret}`).toString('base64')}`;
const results = new Map<string, { status: number; body: unknown }>();
let server: LocalPay;

beforeAll(async () => {
  server = await createLocalPay({ refundDelaySeconds: 3600 });
  const { engine } = server;
  // Stand-ins for the test payments a maintainer completes by hand before recording.
  const paid = engine.createOrder({ amount: 50000 });
  const payment = engine.attemptPayment({ orderId: paid.id, method: 'upi', vpa: 'customer@upi', outcome: { kind: 'success' } });
  const pending = engine.createOrder({ amount: 30000, autoCapture: false });
  const authorized = engine.attemptPayment({ orderId: pending.id, method: 'card', outcome: { kind: 'success' } });
  const env = { PAYMENT_ID: payment.id, AUTHORIZED_PAYMENT_ID: authorized.id, AUTHORIZED_AMOUNT: String(authorized.amount) };

  const responses: Record<string, unknown> = {};
  for (const spec of specs) {
    let path: string;
    let body: unknown;
    try {
      path = resolveTemplate(spec.path, responses, env);
      body = spec.body === undefined ? undefined : resolveBody(spec.body, responses, env);
    } catch (error) {
      if (error instanceof MissingReference) continue;
      throw error;
    }
    const response = await server.app.inject({
      method: spec.method,
      url: path,
      headers: { authorization: spec.name.startsWith('auth-') ? 'Basic invalid' : AUTH },
      ...(body !== undefined && { payload: body as object }),
    });
    const json: unknown = response.json();
    responses[spec.name] = json;
    results.set(spec.name, { status: response.statusCode, body: json });
  }
});

afterAll(() => server.close());

describe('contract: Razorpay fixtures', () => {
  it('has a request spec entry for every fixture', () => {
    const names = new Set(specs.map((s) => s.name));
    expect([...fixtures.keys()].filter((name) => !names.has(name))).toEqual([]);
  });

  for (const spec of specs) {
    const fixture = fixtures.get(spec.name);
    it.skipIf(!fixture)(`${spec.name}${fixture ? ` (${fixture.provenance})` : ' (no fixture yet)'}`, () => {
      if (!fixture) return;
      const actual = results.get(spec.name);
      expect(actual, 'request did not run').toBeDefined();
      expect(actual?.status).toBe(fixture.response.status);
      expect(compareShapes(fixture.response.body, actual?.body)).toEqual([]);

      const expectedError = (fixture.response.body as { error?: Record<string, unknown> }).error;
      if (expectedError) {
        const actualError = (actual?.body as { error: Record<string, unknown> }).error;
        expect(actualError.code).toBe(expectedError.code);
        expect(actualError.field).toBe(expectedError.field);
        // Exact wording is only checked against real recordings.
        if (fixture.provenance === 'recorded') expect(actualError.description).toBe(expectedError.description);
      }
    });
  }
});
