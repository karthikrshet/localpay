import { useState } from 'react';
import { Card, CopyButton, Id } from '../components/ui.tsx';
import type { Session } from '../types.ts';

type Lang = 'node' | 'python' | 'php' | 'java' | 'http' | 'checkout';

export function snippet(lang: Lang, origin: string, keyId: string, keySecret: string): string {
  switch (lang) {
    case 'node':
      return `import Razorpay from 'razorpay';
import { pointAtLocalPay } from '@localpay/shim-node';

const razorpay = pointAtLocalPay(
  new Razorpay({ key_id: '${keyId}', key_secret: '${keySecret}' }),
  '${origin}', // remove this line to use Razorpay test mode
);`;
    case 'python':
      return `import razorpay

client = razorpay.Client(
    auth=("${keyId}", "${keySecret}"),
    base_url="${origin}",  # remove to use Razorpay test mode
)`;
    case 'php':
      return `// The PHP SDK's base-URL override is not verified yet (see the compat matrix).
// Until it is, call the REST API directly:
$ch = curl_init('${origin}/v1/orders');
curl_setopt($ch, CURLOPT_USERPWD, '${keyId}:${keySecret}');
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['amount' => 50000, 'currency' => 'INR']));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);`;
    case 'java':
      return `// The Java SDK's base-URL override is not verified yet (see the compat matrix).
// Until it is, call the REST API directly with any HTTP client:
//   POST ${origin}/v1/orders
//   Authorization: Basic base64("${keyId}:${keySecret}")`;
    case 'http':
      return `curl -u ${keyId}:${keySecret} \\
  -H 'Content-Type: application/json' \\
  -d '{"amount": 50000, "currency": "INR"}' \\
  ${origin}/v1/orders`;
    case 'checkout':
      return `<!-- Replace https://checkout.razorpay.com/v1/checkout.js with: -->
<script src="${origin}/v1/checkout.js"></script>`;
  }
}

const LANGS: { id: Lang; label: string }[] = [
  { id: 'node', label: 'Node' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
  { id: 'java', label: 'Java' },
  { id: 'http', label: 'curl' },
  { id: 'checkout', label: 'Checkout' },
];

export function Home({ session }: { session: Session }) {
  const origin = window.location.origin;
  const [lang, setLang] = useState<Lang>('node');
  const key = session.keys[0] ?? { keyId: '', keySecret: '' };
  const [reveal, setReveal] = useState(false);
  const code = snippet(lang, origin, key.keyId, key.keySecret);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Server">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-lp-muted">API base URL</dt>
          <dd>
            <Id value={origin} />
          </dd>
          <dt className="text-lp-muted">Account</dt>
          <dd>
            <Id value={session.accountId} />
          </dd>
          <dt className="text-lp-muted">Auto-capture</dt>
          <dd>{session.autoCapture ? 'on' : 'off'}</dd>
          <dt className="text-lp-muted">Events recorded</dt>
          <dd>{session.eventCount}</dd>
        </dl>
      </Card>
      <Card title="Test keys" actions={<button type="button" className="text-sm text-lp-primary underline" onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide secrets' : 'Show secrets'}</button>}>
        <ul className="space-y-3">
          {session.keys.map((k) => (
            <li key={k.keyId} className="grid gap-1">
              <Id value={k.keyId} />
              <span className="inline-flex items-center gap-1.5">
                <code className="font-mono">{reveal ? k.keySecret : '•'.repeat(12)}</code>
                <CopyButton value={k.keySecret} label="Copy secret" />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-lp-muted">These keys only work against LocalPay. LocalPay refuses live keys.</p>
      </Card>
      <div className="lg:col-span-2">
        <Card title="Connect your app" actions={<CopyButton value={code} label="Copy snippet" />}>
          <div role="tablist" aria-label="Language" className="mb-3 flex flex-wrap gap-1">
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={lang === l.id}
                onClick={() => setLang(l.id)}
                className={`rounded-md px-3 py-1 text-sm ${lang === l.id ? 'bg-lp-primary text-white' : 'text-lp-muted hover:text-lp-ink'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <pre role="tabpanel" className="overflow-x-auto rounded-md bg-lp-canvas p-3 font-mono text-xs leading-relaxed">
            {code}
          </pre>
        </Card>
      </div>
    </div>
  );
}
