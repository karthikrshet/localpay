import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findDrift } from './check-drift.ts';

const root = mkdtempSync(join(tmpdir(), 'lp-drift-'));
const fresh = join(root, 'fresh');
const committed = join(root, 'committed');
mkdirSync(fresh);
mkdirSync(committed);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const fixture = (name: string, status: number, body: unknown) =>
  JSON.stringify({ name, provenance: 'recorded', recorded_at: '2026-10-19', request: { method: 'GET', path: '/v1/x' }, response: { status, body } });

describe('findDrift', () => {
  it('reports status changes and added or removed fields, and ignores value changes', () => {
    writeFileSync(join(committed, 'same.json'), fixture('same', 200, { id: 'a', amount: 1 }));
    writeFileSync(join(fresh, 'same.json'), fixture('same', 200, { id: 'b', amount: 2 }));
    writeFileSync(join(committed, 'changed.json'), fixture('changed', 200, { id: 'a', old_field: 1 }));
    writeFileSync(join(fresh, 'changed.json'), fixture('changed', 400, { id: 'a', new_field: 1 }));
    writeFileSync(join(fresh, 'only-new.json'), fixture('only-new', 200, {}));
    expect(findDrift(fresh, committed)).toEqual([
      { name: 'changed', problems: ['status 200 → 400', '$.old_field: missing in the new recording', '$.new_field: new in the recording'] },
    ]);
  });
});
