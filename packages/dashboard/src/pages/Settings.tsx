import { useEffect, useState } from 'react';
import { api, useApi } from '../api.ts';
import { Button, Card, ErrorBox } from '../components/ui.tsx';
import type { Faults, WebhookTarget } from '../types.ts';

interface Draft {
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
}

function TargetsEditor() {
  const { data, reload } = useApi<{ items: WebhookTarget[]; events: string[] }>('/webhooks/targets');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) setDrafts(data.items.map((t) => ({ url: t.url, secret: t.secret, events: t.events ?? [], enabled: t.enabled !== false })));
  }, [data]);

  const update = (index: number, patch: Partial<Draft>) => setDrafts((all) => all.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const save = () =>
    api('/webhooks/targets', { method: 'PUT', body: drafts.map((d) => ({ url: d.url, secret: d.secret, events: d.events.length ? d.events : null, enabled: d.enabled })) }).then(
      () => {
        setStatus({ ok: true, text: 'Saved.' });
        reload();
      },
      (e: unknown) => setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) }),
    );

  return (
    <Card title="Webhook targets" actions={<Button onClick={() => setDrafts((d) => [...d, { url: 'http://127.0.0.1:3000/webhooks', secret: 'localpay_webhook_secret', events: [], enabled: true }])}>Add target</Button>}>
      <div className="grid gap-4">
        {drafts.map((draft, index) => (
          <fieldset key={index} className="grid gap-2 rounded-md border border-lp-border p-3">
            <legend className="px-1 text-xs text-lp-muted">Target {index + 1}</legend>
            <label className="grid gap-1">
              <span className="text-xs text-lp-muted">URL</span>
              <input value={draft.url} onChange={(e) => update(index, { url: e.target.value })} className="rounded-md border border-lp-border bg-lp-surface px-3 py-1.5 font-mono" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-lp-muted">Secret (used for X-Razorpay-Signature)</span>
              <input value={draft.secret} onChange={(e) => update(index, { secret: e.target.value })} className="rounded-md border border-lp-border bg-lp-surface px-3 py-1.5 font-mono" />
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {data?.events.map((name) => (
                <label key={name} className="inline-flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.events.includes(name)}
                    onChange={(e) => update(index, { events: e.target.checked ? [...draft.events, name] : draft.events.filter((x) => x !== name) })}
                  />
                  <code className="font-mono text-xs">{name}</code>
                </label>
              ))}
            </div>
            <p className="text-xs text-lp-muted">No events ticked means all events.</p>
            <div className="flex gap-3">
              <label className="inline-flex items-center gap-1 text-sm">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => update(index, { enabled: e.target.checked })} /> Enabled
              </label>
              <Button variant="danger" onClick={() => setDrafts((all) => all.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </div>
          </fieldset>
        ))}
        <div>
          <Button variant="primary" onClick={() => void save()}>
            Save targets
          </Button>
        </div>
        {status && (status.ok ? <p role="status">{status.text}</p> : <ErrorBox message={status.text} />)}
      </div>
    </Card>
  );
}

const FAULT_FIELDS: { key: keyof Faults; label: string; help: string; max: number; step: number }[] = [
  { key: 'duplicateRate', label: 'Duplicate rate', help: 'Chance (0–1) a delivery is sent twice with the same event id.', max: 1, step: 0.05 },
  { key: 'outOfOrderRate', label: 'Out-of-order rate', help: 'Chance a delivery is held back 3 s so later events overtake it.', max: 1, step: 0.05 },
  { key: 'unsignedRate', label: 'Missing signature rate', help: 'Chance the X-Razorpay-Signature header is left out.', max: 1, step: 0.05 },
  { key: 'delayMs', label: 'Delay (ms)', help: 'Extra delay before every first attempt.', max: 600_000, step: 100 },
];

function FaultsEditor() {
  const { data, reload } = useApi<Faults>('/webhooks/faults');
  const [draft, setDraft] = useState<Faults | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(data), [data]);
  if (!draft) return null;
  const save = () => api('/webhooks/faults', { method: 'PUT', body: draft }).then(reload, (e: unknown) => setError(String(e)));
  return (
    <Card title="Failure injection">
      <div className="grid gap-3 sm:grid-cols-2">
        {FAULT_FIELDS.map((f) => (
          <label key={f.key} className="grid gap-1">
            <span className="font-medium">{f.label}</span>
            <input
              type="number"
              min={0}
              max={f.max}
              step={f.step}
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
              className="rounded-md border border-lp-border bg-lp-surface px-3 py-1.5"
            />
            <span className="text-xs text-lp-muted">{f.help}</span>
          </label>
        ))}
      </div>
      <Button variant="primary" className="mt-3" onClick={() => void save()}>
        Save
      </Button>
      {error && <ErrorBox message={error} />}
    </Card>
  );
}

function ResetCard() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <Card title="Reset data">
      <p className="mb-3 text-lp-muted">Deletes every order, payment, refund, event and webhook delivery in this LocalPay. Settings stay.</p>
      {confirming ? (
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() =>
              void api('/reset', { method: 'POST' }).then(() => {
                setDone(true);
                setConfirming(false);
              })
            }
          >
            Yes, delete everything
          </Button>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Reset data…
        </Button>
      )}
      {done && <p role="status">All data deleted.</p>}
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="grid gap-4">
      <TargetsEditor />
      <FaultsEditor />
      <ResetCard />
    </div>
  );
}
