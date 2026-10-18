import { useState, type FormEvent } from 'react';
import { api, useApi } from '../api.ts';
import { Button, Card, ErrorBox, formatTime } from '../components/ui.tsx';

const STEPS = ['1h', '1d', '3d', '7d', '30d'];

export function TimePage() {
  const { data, reload } = useApi<{ now: number; offsetMs: number }>('/time');
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const advance = (duration: string) => {
    setError(null);
    api<{ now: number; processed: number }>('/time/advance', { method: 'POST', body: { duration } }).then(
      (result) => {
        setMessage(`Moved forward ${duration}. ${result.processed} scheduled change(s) ran.`);
        reload();
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (custom.trim()) advance(custom.trim());
  };

  return (
    <Card title="Emulator time">
      {data && (
        <dl className="mb-4 grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-lp-muted">Now (emulator)</dt>
            <dd className="text-lg font-semibold">{formatTime(data.now)}</dd>
          </div>
          <div>
            <dt className="text-xs text-lp-muted">Ahead of real time</dt>
            <dd>{(data.offsetMs / 3_600_000).toFixed(1)} h</dd>
          </div>
        </dl>
      )}
      <p className="mb-3 text-lp-muted">Fast-forward to process pending refunds now; settlements and subscription renewals use the same clock.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {STEPS.map((step) => (
          <Button key={step} onClick={() => advance(step)}>
            +{step}
          </Button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-lp-muted">Custom (e.g. 2h, 1d12h, 1w)</span>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} className="rounded-md border border-lp-border bg-lp-surface px-3 py-1.5" />
        </label>
        <Button type="submit" variant="primary">
          Fast-forward
        </Button>
      </form>
      {message && (
        <p role="status" className="mt-3 text-green-800">
          {message}
        </p>
      )}
      {error && <ErrorBox message={error} />}
    </Card>
  );
}
