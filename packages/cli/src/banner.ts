// What `localpay start` prints. Colours only on a TTY and never with NO_COLOR.
import type { LocalPayConfig } from '@localpay/server';

export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  blue(s: string): string;
  amber(s: string): string;
  red(s: string): string;
}

export function createStyle(enabled: boolean): Style {
  const wrap = (open: number, close: number) => (s: string) => (enabled ? `\u001b[${open}m${s}\u001b[${close}m` : s);
  return { bold: wrap(1, 22), dim: wrap(2, 22), blue: wrap(34, 39), amber: wrap(33, 39), red: wrap(31, 39) };
}

const DEMO_SECRET = 'localpay_demo_secret';

export function banner(input: { version: string; url: string; dashboardUrl: string; config: LocalPayConfig; generatedPassword?: string | null }, style: Style): string {
  const { url, config } = input;
  const row = (label: string, value: string) => `  ${style.dim(label.padEnd(10))} ${value}`;
  const lines = [
    '',
    `${style.amber('●')} ${style.bold(`LocalPay ${input.version}`)} ${style.dim('— test mode, no real money moves')}`,
    '',
    row('API', `${style.blue(`${url}/v1`)}  ${style.dim('(set your SDK base URL to')} ${url}${style.dim(')')}`),
    row('Checkout', `${url}/v1/checkout.js`),
    row('Dashboard', style.blue(input.dashboardUrl)),
  ];
  for (const key of config.keys) {
    // The shipped demo secret is public; anything else the user configured is masked.
    lines.push(row('Key', `${key.keyId}  ${style.dim('secret')} ${key.keySecret === DEMO_SECRET ? key.keySecret : '••••••••'}`));
  }
  if (config.webhooks.length === 0) lines.push(row('Webhooks', style.dim('none — add with --webhook http://127.0.0.1:3000/webhooks')));
  for (const hook of config.webhooks) lines.push(row('Webhook', `${hook.url}  ${style.dim(hook.events?.join(', ') ?? 'all events')}`));
  if (config.persist) lines.push(row('Data', config.persist));
  if (config.seed) lines.push(row('Seed', config.seed));
  if (input.generatedPassword) lines.push(row('Password', `${input.generatedPassword}  ${style.dim('(generated dashboard password)')}`));
  if (config.allowPublic) {
    lines.push('', style.red(`  WARNING: listening on ${config.host}. Anyone who can reach this address can use LocalPay.`), style.red('  It is a test tool: never put it on the public internet.'));
  }
  lines.push('', style.dim('  Independent project, not affiliated with Razorpay. Press Ctrl+C to stop.'), '');
  return lines.join('\n');
}
