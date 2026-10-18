import { useState } from 'react';
import { api, useApi } from '../api.ts';
import { Badge, Button, Card, Empty, ErrorBox, formatMoney, formatTime, Id, JsonView, Table, Timeline } from '../components/ui.tsx';
import { Link } from '../router.tsx';
import type { LocalPayEvent, WireOrder, WirePayment, WireRefund } from '../types.ts';

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-lp-border bg-lp-surface px-3 py-1.5 sm:w-72"
      />
    </label>
  );
}

export function OrdersPage() {
  const [query, setQuery] = useState('');
  const { data, error } = useApi<{ items: WireOrder[] }>(`/orders?q=${encodeURIComponent(query)}`);
  return (
    <Card title="Orders" actions={<SearchBox value={query} onChange={setQuery} label="Search id, receipt, notes" />}>
      {error && <ErrorBox message={error} />}
      {!data && !error && <Empty>Loading…</Empty>}
      {data && data.items.length === 0 && <Empty>No orders yet. Create one with POST /v1/orders.</Empty>}
      {data && data.items.length > 0 && (
        <Table head={['Order', 'Amount', 'Status', 'Attempts', 'Receipt', 'Created']}>
          {data.items.map((o) => (
            <tr key={o.id} className="hover:bg-lp-canvas">
              <td className="px-3 py-2">
                <Link to={`/orders/${o.id}`} className="font-mono text-lp-primary underline-offset-2 hover:underline">
                  {o.id}
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-2">{formatMoney(o.amount, o.currency)}</td>
              <td className="px-3 py-2">
                <Badge status={o.status} />
              </td>
              <td className="px-3 py-2">{o.attempts}</td>
              <td className="px-3 py-2">{o.receipt ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 text-lp-muted">{formatTime(o.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

export function PaymentRow({ payment, onChange }: { payment: WirePayment; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const capture = () => api(`/payments/${payment.id}/capture`, { method: 'POST' }).then(onChange, (e: unknown) => setError(String(e)));
  return (
    <tr className="hover:bg-lp-canvas">
      <td className="px-3 py-2">
        <Link to={`/payments/${payment.id}`} className="font-mono text-lp-primary hover:underline">
          {payment.id}
        </Link>
      </td>
      <td className="px-3 py-2">{payment.method}</td>
      <td className="whitespace-nowrap px-3 py-2">{formatMoney(payment.amount, payment.currency)}</td>
      <td className="px-3 py-2">
        <Badge status={payment.status} />
        {payment.error_reason && <span className="ml-2 text-xs text-lp-muted">{payment.error_reason}</span>}
      </td>
      <td className="px-3 py-2">
        {payment.status === 'authorized' && (
          <Button variant="primary" onClick={() => void capture()}>
            Capture
          </Button>
        )}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </td>
    </tr>
  );
}

export function RefundRow({ refund, onChange }: { refund: WireRefund; onChange: () => void }) {
  const act = (action: 'process' | 'fail') => void api(`/refunds/${refund.id}/${action}`, { method: 'POST' }).then(onChange, onChange);
  return (
    <tr>
      <td className="px-3 py-2 font-mono">{refund.id}</td>
      <td className="whitespace-nowrap px-3 py-2">{formatMoney(refund.amount, refund.currency)}</td>
      <td className="px-3 py-2">
        <Badge status={refund.status} />
      </td>
      <td className="px-3 py-2">{refund.speed_processed ?? refund.speed_requested}</td>
      <td className="space-x-2 px-3 py-2">
        {refund.status === 'pending' && (
          <>
            <Button onClick={() => act('process')}>Process now</Button>
            <Button variant="danger" onClick={() => act('fail')}>
              Fail refund
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { data, error, reload } = useApi<{ order: WireOrder; payments: WirePayment[]; refunds: WireRefund[]; events: LocalPayEvent[] }>(`/orders/${encodeURIComponent(id)}`);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Empty>Loading…</Empty>;
  const { order, payments, refunds, events } = data;
  return (
    <div className="grid gap-4">
      <Card title={<Id value={order.id} />} actions={<Badge status={order.status} />}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-lp-muted">Amount</dt>
            <dd className="text-lg font-semibold">{formatMoney(order.amount, order.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-lp-muted">Paid</dt>
            <dd>{formatMoney(order.amount_paid, order.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-lp-muted">Due</dt>
            <dd>{formatMoney(order.amount_due, order.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-lp-muted">Attempts</dt>
            <dd>{order.attempts}</dd>
          </div>
        </dl>
      </Card>
      <Card title="Payments">
        {payments.length === 0 ? (
          <Empty>No payment attempts yet. Open checkout with this order_id.</Empty>
        ) : (
          <Table head={['Payment', 'Method', 'Amount', 'Status', '']}>
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onChange={reload} />
            ))}
          </Table>
        )}
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Event timeline">
          <Timeline events={events} />
        </Card>
        <Card title="JSON">
          <JsonView value={order} />
        </Card>
      </div>
    </div>
  );
}
