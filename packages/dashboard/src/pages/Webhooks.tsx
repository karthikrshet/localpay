import { Fragment, useState } from 'react';
import { api, useApi } from '../api.ts';
import { Badge, Button, Card, Empty, ErrorBox, formatMs, JsonView, Table } from '../components/ui.tsx';
import { Link } from '../router.tsx';
import type { Delivery, WebhookTarget } from '../types.ts';

function parseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function DeliveryDetail({ delivery, onAction }: { delivery: Delivery; onAction: (path: string) => void }) {
  const last = delivery.attempts.at(-1);
  return (
    <div className="grid gap-3 bg-lp-canvas p-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onAction(`/webhooks/deliveries/${delivery.id}/replay`)}>Replay now</Button>
        <Button onClick={() => onAction(`/webhooks/deliveries/${delivery.id}/send-twice`)}>Send twice</Button>
        <Button onClick={() => onAction(`/webhooks/deliveries/${delivery.id}/replay-unsigned`)}>Send without signature</Button>
      </div>
      <p className="text-xs text-lp-muted">
        Replaying an older delivery sends it after newer ones, which is how out-of-order delivery looks to your app. All replays keep the same event id.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-lp-muted">Request body</h3>
          <JsonView value={parseBody(delivery.body)} />
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-lp-muted">Attempts</h3>
          {delivery.attempts.length === 0 ? (
            <Empty>Not sent yet{delivery.nextAttemptAt ? ` — due ${formatMs(delivery.nextAttemptAt)}` : ''}.</Empty>
          ) : (
            <ol className="space-y-2 text-xs">
              {delivery.attempts.map((attempt, index) => (
                <li key={attempt.at + index} className="rounded border border-lp-border bg-lp-surface p-2">
                  <div className="font-semibold">
                    #{index + 1} · {formatMs(attempt.at)} · {attempt.statusCode ?? 'no response'}
                    {attempt.latencyMs !== null && ` · ${attempt.latencyMs} ms`}
                  </div>
                  {attempt.error && <div className="text-red-700 dark:text-red-400">{attempt.error}</div>}
                  {attempt.responseBody && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono">{attempt.responseBody}</pre>}
                </li>
              ))}
            </ol>
          )}
          {last && (
            <>
              <h3 className="mb-1 mt-3 text-xs font-semibold uppercase text-lp-muted">Last request headers</h3>
              <JsonView value={last.requestHeaders} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WebhooksPage() {
  const deliveries = useApi<{ items: Delivery[] }>('/webhooks/deliveries');
  const targets = useApi<{ items: WebhookTarget[] }>('/webhooks/targets');
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = (path: string) => {
    setError(null);
    api(path, { method: 'POST' }).then(deliveries.reload, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="grid gap-4">
      <Card title="Targets" actions={<Link to="/settings" className="text-sm text-lp-primary underline">Edit in settings</Link>}>
        {targets.data?.items.length === 0 && <Empty>No webhook targets. Start with --webhook http://127.0.0.1:3000/webhooks or add one in Settings.</Empty>}
        <ul className="space-y-1">
          {targets.data?.items.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2">
              <code className="font-mono">{t.url}</code>
              <span className="text-xs text-lp-muted">{t.events?.length ? t.events.join(', ') : 'all events'}</span>
              {t.enabled === false && <Badge status="disabled" />}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Deliveries">
        {(error ?? deliveries.error) && <ErrorBox message={error ?? deliveries.error ?? ''} />}
        {!deliveries.data && !deliveries.error && <Empty>Loading…</Empty>}
        {deliveries.data?.items.length === 0 && <Empty>No deliveries yet. Pay for an order to see webhooks arrive here.</Empty>}
        {deliveries.data && deliveries.data.items.length > 0 && (
          <Table head={['Event', 'Status', 'HTTP', 'Latency', 'Attempts', 'Notes', 'Created']}>
            {deliveries.data.items.map((d) => {
              const last = d.attempts.at(-1);
              const expanded = open === d.id;
              return (
                <Fragment key={d.id}>
                  <tr className="hover:bg-lp-canvas">
                    <td className="px-3 py-2">
                      <button type="button" aria-expanded={expanded} className="font-mono text-lp-primary hover:underline" onClick={() => setOpen(expanded ? null : d.id)}>
                        {d.event}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Badge status={d.status} />
                    </td>
                    <td className="px-3 py-2">{last?.statusCode ?? '—'}</td>
                    <td className="px-3 py-2">{last?.latencyMs != null ? `${last.latencyMs} ms` : '—'}</td>
                    <td className="px-3 py-2">{d.attempts.length}</td>
                    <td className="px-3 py-2 text-xs text-lp-muted">{d.notes.join(', ') || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-lp-muted">{formatMs(d.createdAt)}</td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={7}>
                        <DeliveryDetail delivery={d} onAction={act} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
