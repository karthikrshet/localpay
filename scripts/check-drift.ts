// Compares fresh recordings with the committed fixtures by shape, to notice when the
// real API changes. Run by the nightly workflow after record-fixtures + scrub-fixtures.
//
// Usage: node --experimental-strip-types scripts/check-drift.ts <recordings-dir> [fixtures-dir]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareShapes } from '../fixtures/shape.ts';
import type { Fixture } from './record-fixtures.ts';

export interface Drift {
  name: string;
  problems: string[];
}

export function findDrift(recordingsDir: string, fixturesDir: string): Drift[] {
  const drift: Drift[] = [];
  for (const file of readdirSync(recordingsDir).filter((f) => f.endsWith('.json')).sort()) {
    const committedPath = join(fixturesDir, file);
    if (!existsSync(committedPath)) continue;
    const fresh = JSON.parse(readFileSync(join(recordingsDir, file), 'utf8')) as Fixture;
    const committed = JSON.parse(readFileSync(committedPath, 'utf8')) as Fixture;
    const problems = [
      ...(fresh.response.status === committed.response.status ? [] : [`status ${committed.response.status} → ${fresh.response.status}`]),
      ...compareShapes(committed.response.body, fresh.response.body).map((p) => p.replace('in LocalPay', 'in the new recording').replace('not in the recorded response', 'new in the recording')),
    ];
    if (problems.length) drift.push({ name: fresh.name, problems });
  }
  return drift;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [recordings, fixtures = 'fixtures/razorpay'] = process.argv.slice(2);
  if (!recordings) {
    console.error('usage: check-drift.ts <recordings-dir> [fixtures-dir]');
    process.exit(2);
  }
  const drift = findDrift(recordings, fixtures);
  for (const d of drift) console.log(`## ${d.name}\n${d.problems.map((p) => `- ${p}`).join('\n')}\n`);
  console.log(drift.length ? `${drift.length} fixture(s) drifted` : 'no drift');
  process.exit(drift.length ? 1 : 0);
}
