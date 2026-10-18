// Fails if tracked files contain live keys or private keys, or if fixtures contain
// anything resembling a key, email, phone number or card number. Runs in CI.
//
// Usage: node --experimental-strip-types scripts/check-secrets.ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export interface Finding {
  file: string;
  line: number;
  rule: string;
  match: string;
}

/** Obviously fake values used in tests and docs. */
const ALLOWED = new Set([
  'rzp_live_ABCDEFGHIJKLMN',
  'rzp_live_AbCdEf123456',
  'rzp_test_XXXXXXXXXXXXXX',
  'customer@example.com',
  '+919999999999',
  '9999999999',
]);

export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

interface Rule {
  name: string;
  pattern: RegExp;
  fixturesOnly: boolean;
  accept?: (match: string) => boolean;
}

const RULES: Rule[] = [
  { name: 'live API key', pattern: /rzp_live_[A-Za-z0-9]{6,}/g, fixturesOnly: false },
  { name: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, fixturesOnly: false },
  { name: 'test API key', pattern: /rzp_test_[A-Za-z0-9]{6,}/g, fixturesOnly: true },
  { name: 'email address', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, fixturesOnly: true, accept: (m) => /@example\.(?:com|org|net)$/.test(m) },
  { name: 'phone number', pattern: /(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, fixturesOnly: true },
  { name: 'card number', pattern: /\b\d{13,19}\b/g, fixturesOnly: true, accept: (m) => !luhnValid(m) },
];

export function scanText(file: string, text: string): Finding[] {
  const inFixtures = file.replaceAll('\\', '/').startsWith('fixtures/');
  const findings: Finding[] = [];
  text.split('\n').forEach((content, index) => {
    for (const rule of RULES) {
      if (rule.fixturesOnly && !inFixtures) continue;
      for (const match of content.match(rule.pattern) ?? []) {
        if (ALLOWED.has(match) || rule.accept?.(match)) continue;
        findings.push({ file, line: index + 1, rule: rule.name, match });
      }
    }
  });
  return findings;
}

const SKIP = /(?:^|\/)(?:pnpm-lock\.yaml|LICENSE)$|\.(?:png|jpe?g|gif|ico|woff2?|docx|pdf)$/;

export function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => f && !SKIP.test(f));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const findings = trackedFiles().flatMap((file) => {
    try {
      return scanText(file, readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  });
  for (const f of findings) console.error(`${f.file}:${f.line}: ${f.rule}: ${f.match.slice(0, 12)}…`);
  console.log(findings.length ? `${findings.length} possible secret(s) found` : 'no secrets found');
  process.exit(findings.length ? 1 : 0);
}
