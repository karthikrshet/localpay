// Removes keys and personal data from recorded API fixtures before they are committed.
// Keeps field names, types and ID formats so contract tests still mean something.
//
// Usage: node --experimental-strip-types scripts/scrub-fixtures.ts <file-or-dir>...  (rewrites in place)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLACEHOLDERS = {
  keyId: 'rzp_test_XXXXXXXXXXXXXX',
  email: 'customer@example.com',
  contact: '+919999999999',
  name: 'Test Customer',
  vpa: 'customer@upi',
  ip: '192.0.2.1',
  accountId: 'acc_XXXXXXXXXXXXXX',
  last4: '1111',
  secret: '[REDACTED]',
  address: '[REDACTED]',
} as const;

/** Fields whose whole value is replaced, by key name. */
const FIELD_RULES: Record<string, unknown> = {
  email: PLACEHOLDERS.email,
  contact: PLACEHOLDERS.contact,
  phone: PLACEHOLDERS.contact,
  name: PLACEHOLDERS.name,
  customer_name: PLACEHOLDERS.name,
  vpa: PLACEHOLDERS.vpa,
  ip: PLACEHOLDERS.ip,
  account_id: PLACEHOLDERS.accountId,
  merchant_id: PLACEHOLDERS.accountId,
  last4: PLACEHOLDERS.last4,
  key_secret: PLACEHOLDERS.secret,
  secret: PLACEHOLDERS.secret,
  authorization: PLACEHOLDERS.secret,
  address: PLACEHOLDERS.address,
  line1: PLACEHOLDERS.address,
  line2: PLACEHOLDERS.address,
  billing_address: PLACEHOLDERS.address,
  shipping_address: PLACEHOLDERS.address,
};

/** Patterns replaced inside any string, wherever they appear. */
const STRING_RULES: [RegExp, string][] = [
  [/rzp_(?:test|live)_[A-Za-z0-9]{6,}/g, PLACEHOLDERS.keyId],
  [/acc_[A-Za-z0-9]{14}/g, PLACEHOLDERS.accountId],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, PLACEHOLDERS.email],
  [/(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, PLACEHOLDERS.contact],
  // 12–19 digits, except a 91-prefixed mobile number (already handled above).
  [/\b(?!91[6-9]\d{9}\b)\d{12,19}\b/g, '[CARD-OR-ACCOUNT-NUMBER]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, PLACEHOLDERS.ip],
];

function scrubString(value: string): string {
  return STRING_RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export function scrub(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => {
        const rule = FIELD_RULES[key.toLowerCase()];
        return [key, rule !== undefined && child !== null && typeof child !== 'object' ? rule : scrub(child)];
      }),
    );
  }
  return value;
}

function jsonFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => (entry.startsWith('.') ? [] : jsonFiles(join(path, entry)))).filter((f) => f.endsWith('.json'));
}

export function scrubFile(path: string): boolean {
  const before = readFileSync(path, 'utf8');
  const after = `${JSON.stringify(scrub(JSON.parse(before)), null, 2)}\n`;
  if (after !== before) writeFileSync(path, after);
  return after !== before;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('usage: scrub-fixtures.ts <file-or-dir>...');
    process.exit(2);
  }
  for (const file of targets.flatMap(jsonFiles)) console.log(`${scrubFile(file) ? 'scrubbed ' : 'unchanged'} ${file}`);
}
