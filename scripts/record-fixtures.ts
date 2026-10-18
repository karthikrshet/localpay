// Records real Razorpay test-mode responses for contract tests. Maintainer-only:
// it needs YOUR OWN test keys in the environment and never accepts live keys.
//
//   RZP_KEY_ID=rzp_test_... RZP_KEY_SECRET=... \
//   PAYMENT_ID=pay_... (a test payment you completed in checkout, optional) \
//   node --experimental-strip-types scripts/record-fixtures.ts fixtures/requests/core.json
//
// Raw recordings go to .fixture-recordings/ (git-ignored). Then run
// `pnpm scrub-fixtures .fixture-recordings`, review the diff, and move files into fixtures/razorpay/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const API_HOST = 'https://api.razorpay.com';

export interface RequestSpec {
  name: string;
  method: 'GET' | 'POST' | 'PATCH';
  /** May reference earlier responses, e.g. /v1/orders/{order-create.id}, or env vars as {env.PAYMENT_ID}. */
  path: string;
  body?: unknown;
  /** Skip this request when a referenced env var is missing instead of failing. */
  optional?: boolean;
}

export interface Fixture {
  name: string;
  provenance: 'recorded' | 'hand-written';
  recorded_at: string;
  request: { method: string; path: string; body?: unknown };
  response: { status: number; body: unknown };
}

export function assertTestCredentials(env: NodeJS.ProcessEnv): { keyId: string; keySecret: string } {
  const keyId = env.RZP_KEY_ID ?? '';
  const keySecret = env.RZP_KEY_SECRET ?? '';
  if (keyId.startsWith('rzp_live_')) throw new Error('Refusing to run with a live key. Use your rzp_test_ key.');
  if (!keyId.startsWith('rzp_test_') || !keySecret) throw new Error('Set RZP_KEY_ID (rzp_test_...) and RZP_KEY_SECRET to your own test credentials.');
  return { keyId, keySecret };
}

export class MissingReference extends Error {}

/** Replaces {name.field.sub} and {env.NAME} using earlier responses and the environment. */
export function resolveTemplate(text: string, responses: Record<string, unknown>, env: NodeJS.ProcessEnv): string {
  return text.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_whole, ref: string) => {
    const [head, ...rest] = ref.split('.');
    let value: unknown = head === 'env' ? env[rest.shift() ?? ''] : responses[head ?? ''];
    for (const key of rest) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
    if (typeof value !== 'string' && typeof value !== 'number') throw new MissingReference(`cannot resolve {${ref}}`);
    return encodeURIComponent(String(value));
  });
}

export function toFixture(spec: RequestSpec, path: string, status: number, body: unknown, now: Date): Fixture {
  return {
    name: spec.name,
    provenance: 'recorded',
    recorded_at: now.toISOString().slice(0, 10),
    request: { method: spec.method, path, ...(spec.body !== undefined && { body: spec.body }) },
    response: { status, body },
  };
}

async function record(specFile: string, outDir: string): Promise<void> {
  const { keyId, keySecret } = assertTestCredentials(process.env);
  const specs = JSON.parse(readFileSync(specFile, 'utf8')) as RequestSpec[];
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  const responses: Record<string, unknown> = {};
  mkdirSync(outDir, { recursive: true });
  for (const spec of specs) {
    let path: string;
    try {
      path = resolveTemplate(spec.path, responses, process.env);
    } catch (error) {
      if (spec.optional && error instanceof MissingReference) {
        console.log(`skip     ${spec.name} (${error.message})`);
        continue;
      }
      throw error;
    }
    const url = new URL(path, API_HOST);
    if (url.origin !== API_HOST) throw new Error(`refusing to call ${url.origin}`);
    const response = await fetch(url, {
      method: spec.method,
      headers: { authorization: spec.name.startsWith('auth-') ? 'Basic invalid' : auth, 'content-type': 'application/json' },
      ...(spec.body !== undefined && { body: JSON.stringify(spec.body) }),
    });
    const body: unknown = await response.json();
    responses[spec.name] = body;
    writeFileSync(join(outDir, `${spec.name}.json`), `${JSON.stringify(toFixture(spec, path, response.status, body, new Date()), null, 2)}\n`);
    console.log(`recorded ${spec.name} → ${response.status}`);
  }
  console.log(`\nNext: pnpm scrub-fixtures ${outDir}, review every file, then move them to fixtures/razorpay/.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [specFile, outDir = '.fixture-recordings'] = process.argv.slice(2);
  if (!specFile) {
    console.error('usage: record-fixtures.ts <spec.json> [outDir]');
    process.exit(2);
  }
  record(specFile, outDir).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
