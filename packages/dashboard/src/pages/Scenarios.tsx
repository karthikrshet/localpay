import { useState } from 'react';
import { api, useApi } from '../api.ts';
import { Badge, Button, Card, Empty, ErrorBox } from '../components/ui.tsx';

interface GalleryItem {
  id: string;
  name: string;
  description: string;
  yaml: string;
}

interface RunResult {
  name: string;
  ok: boolean;
  steps: { at: string; step: string; ok: boolean; detail: string }[];
  checks: { name: string; ok: boolean; detail: string }[];
  summary: Record<string, Record<string, number>>;
  events: { seq: number; id: string; type: string }[];
}

const EXAMPLE = `name: My scenario
seed: my-seed
steps:
  - order: { amount: 49900, as: tee }
  - pay: { order: tee, scenario: upi_timeout }
  - pay: { order: tee, scenario: success }
expect:
  orders: { paid: 1 }
`;

function Mark({ ok }: { ok: boolean }) {
  return (
    <span aria-label={ok ? 'passed' : 'failed'} className={ok ? 'text-green-700' : 'text-red-700'}>
      {ok ? '✓' : '✗'}
    </span>
  );
}

function ResultView({ result }: { result: RunResult }) {
  return (
    <Card title={result.name} actions={<Badge status={result.ok ? 'passed' : 'failed'} />}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-lp-muted">Steps</h3>
          <ol className="space-y-1 font-mono text-xs">
            {result.steps.map((s) => (
              <li key={s.at} className="flex gap-2">
                <Mark ok={s.ok} />
                <span className="w-14 shrink-0 text-lp-muted">{s.at}</span>
                <span className="w-24 shrink-0">{s.step}</span>
                <span className="break-all">{s.detail}</span>
              </li>
            ))}
          </ol>
          {result.checks.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-lp-muted">Expectations</h3>
              <ul className="space-y-1 text-sm">
                {result.checks.map((c) => (
                  <li key={c.name} className="flex gap-2">
                    <Mark ok={c.ok} />
                    <code className="font-mono">{c.name}</code>
                    <span className="text-lp-muted">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-lp-muted">Summary</h3>
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {Object.entries(result.summary)
              .filter(([, counts]) => Object.keys(counts).length > 0)
              .map(([kind, counts]) => (
                <div key={kind} className="contents">
                  <dt className="text-lp-muted">{kind}</dt>
                  <dd>{Object.entries(counts).map(([status, n]) => `${n} ${status}`).join(', ')}</dd>
                </div>
              ))}
          </dl>
          <h3 className="mb-2 text-xs font-semibold uppercase text-lp-muted">Events ({result.events.length})</h3>
          <ol className="max-h-72 space-y-0.5 overflow-auto font-mono text-xs">
            {result.events.map((e) => (
              <li key={e.id}>
                <span className="text-lp-muted">#{e.seq}</span> {e.type}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}

export function ScenariosPage() {
  const { data, error } = useApi<{ items: GalleryItem[] }>('/scenarios');
  const [result, setResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [yaml, setYaml] = useState(EXAMPLE);
  const [shown, setShown] = useState<string | null>(null);

  const run = (body: { id: string } | { yaml: string }, label: string) => {
    setRunning(label);
    setRunError(null);
    api<RunResult>('/scenarios/run', { method: 'POST', body })
      .then(setResult, (e: unknown) => setRunError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRunning(null));
  };

  return (
    <div className="grid gap-4">
      <p className="text-lp-muted">Scenarios run against this server: they create real orders and payments and send webhooks to your targets.</p>
      {runError && <ErrorBox message={runError} />}
      {result && <ResultView result={result} />}
      <Card title="Gallery">
        {error && <ErrorBox message={error} />}
        {!data && !error && <Empty>Loading…</Empty>}
        <ul className="grid gap-3 md:grid-cols-2">
          {data?.items.map((item) => (
            <li key={item.id} className="grid content-between gap-2 rounded-md border border-lp-border p-3">
              <div>
                <h3 className="font-semibold">{item.name}</h3>
                <p className="text-sm text-lp-muted">{item.description}</p>
              </div>
              {shown === item.id && <pre className="overflow-x-auto rounded bg-lp-canvas p-2 font-mono text-xs">{item.yaml}</pre>}
              <div className="flex gap-2">
                <Button variant="primary" disabled={running !== null} onClick={() => run({ id: item.id }, item.id)}>
                  {running === item.id ? 'Running…' : 'Run'}
                </Button>
                <Button onClick={() => setShown(shown === item.id ? null : item.id)}>{shown === item.id ? 'Hide YAML' : 'View YAML'}</Button>
                <Button onClick={() => setYaml(item.yaml)}>Edit a copy</Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Your scenario">
        <label className="grid gap-1">
          <span className="text-xs text-lp-muted">YAML (see the scenarios guide for every step type)</span>
          <textarea value={yaml} onChange={(e) => setYaml(e.target.value)} rows={12} spellCheck={false} className="rounded-md border border-lp-border bg-lp-surface p-3 font-mono text-xs" />
        </label>
        <Button variant="primary" className="mt-3" disabled={running !== null} onClick={() => run({ yaml }, 'custom')}>
          {running === 'custom' ? 'Running…' : 'Run scenario'}
        </Button>
      </Card>
    </div>
  );
}
