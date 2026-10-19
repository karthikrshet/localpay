import { useState } from 'react';
import { api, useApi } from '../api.ts';
import { Badge, Button, Card, Empty, ErrorBox, formatMoney, formatTime, Id, JsonView, Table, Timeline } from '../components/ui.tsx';
import { Link } from '../router.tsx';
import type { LocalPayEvent, WireDispute, WirePayment, WireRefund } from '../types.ts';
import { PaymentRow, RefundRow, SearchBox } from './Orders.tsx';

export function PaymentsPage() {
  const [query, setQuery] = useState('');
  const { data, error, reload } = useApi<{ items: WirePayment[] }>(`/payments?q=${encodeURIComponent(query)}`);
  return (
    <Card title="Payments" actions={<SearchBox value={query} onChange={setQuery} label="Search id, order, email, VPA" />}>
      {error && <ErrorBox message={error} />}
      {!data && !error && <Empty>Loading…</Empty>}
      {data && data.items.length === 0 && <Empty>No payments yet.</Empty>}
      {data && data.items.length > 0 && (
        <Table head={['Payment', 'Method', 'Amount', 'Status', '']}>
          {data.items.map((p) => (
            <PaymentRow key={p.id} payment={p} onChange={reload} />
          ))}
        </Table>
      )}
    </Card>
  );
}

function DisputesCard({ payment, disputes, onChange }: { payment: WirePayment; disputes: WireDispute[]; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const act = (path: string, body?: unknown) => {
    setError(null);
    api(path, { method: 'POST', ...(body !== undefined && { body }) }).then(onChange, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  return (
    <Card
      title="Disputes"
      actions={payment.captured && <Button onClick={() => act(`/payments/${payment.id}/dispute`, {})}>Raise dispute (as the bank)</Button>}
    >
      {error && <ErrorBox message={error} />}
      {disputes.length === 0 ? (
        <Empty>No disputes. Raising one sends payment.dispute.created to your webhook targets.</Empty>
      ) : (
        <Table head={['Dispute', 'Amount', 'Status', 'Respond by', '']}>
          {disputes.map((d) => (
            <tr key={d.id}>
              <td className="px-3 py-2 font-mono">{d.id}</td>
              <td className="whitespace-nowrap px-3 py-2">{formatMoney(d.amount, d.currency)}</td>
              <td className="px-3 py-2">
                <Badge status={d.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-lp-muted">{formatTime(d.respond_by)}</td>
              <td className="space-x-2 whitespace-nowrap px-3 py-2">
                {d.status === 'open' && (
                  <>
                    <Button onClick={() => act(`/disputes/${d.id}/submit`)}>Submit evidence</Button>
                    <Button variant="danger" onClick={() => act(`/disputes/${d.id}/accept`)}>
                      Accept
                    </Button>
                  </>
                )}
                {d.status === 'under_review' && (
                  <>
                    <Button onClick={() => act(`/disputes/${d.id}/resolve`, { outcome: 'won' })}>Bank: won</Button>
                    <Button variant="danger" onClick={() => act(`/disputes/${d.id}/resolve`, { outcome: 'lost' })}>
                      Bank: lost
                    </Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

export function PaymentDetail({ id }: { id: string }) {
  const { data, error, reload } = useApi<{ payment: WirePayment; refunds: WireRefund[]; disputes: WireDispute[]; events: LocalPayEvent[] }>(`/payments/${encodeURIComponent(id)}`);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Empty>Loading…</Empty>;
  const { payment, refunds, disputes, events } = data;
  return (
    <div className="grid gap-4">
      <Card title={<Id value={payment.id} />} actions={<Badge status={payment.status} />}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-lp-muted">Amount</dt>
            <dd className="text-lg font-semibold">{formatMoney(payment.amount, payment.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-lp-muted">Method</dt>
            <dd>{payment.method}</dd>
          </div>
          <div>
            <dt className="text-xs text-lp-muted">Fee (incl. tax)</dt>
            <dd>{payment.fee === null ? '—' : formatMoney(payment.fee, payment.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-lp-muted">Created</dt>
            <dd>{formatTime(payment.created_at)}</dd>
          </div>
          {payment.order_id && (
            <div className="col-span-2">
              <dt className="text-xs text-lp-muted">Order</dt>
              <dd>
                <Link to={`/orders/${payment.order_id}`} className="font-mono text-lp-primary hover:underline">
                  {payment.order_id}
                </Link>
              </dd>
            </div>
          )}
          {payment.error_code && (
            <div className="col-span-2">
              <dt className="text-xs text-lp-muted">Error</dt>
              <dd>
                <code className="font-mono">{payment.error_code}</code> · {payment.error_reason} — {payment.error_description}
              </dd>
            </div>
          )}
        </dl>
      </Card>
      {refunds.length > 0 && (
        <Card title="Refunds">
          <Table head={['Refund', 'Amount', 'Status', 'Speed', '']}>
            {refunds.map((r) => (
              <RefundRow key={r.id} refund={r} onChange={reload} />
            ))}
          </Table>
        </Card>
      )}
      <DisputesCard payment={payment} disputes={disputes} onChange={reload} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Event timeline">
          <Timeline events={events} />
        </Card>
        <Card title="JSON">
          <JsonView value={payment} />
        </Card>
      </div>
    </div>
  );
}
