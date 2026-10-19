// Payment links (with customers), subscriptions (with plans) and settlements.
import { useState } from 'react';
import { api, useApi } from '../api.ts';
import { Badge, Button, Card, Empty, ErrorBox, formatMoney, formatTime, Table } from '../components/ui.tsx';

interface WireLink {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  description: string;
  reference_id: string;
  status: string;
  short_url: string;
  expire_by: number;
  created_at: number;
}

interface WireCustomer {
  id: string;
  name: string | null;
  email: string | null;
  contact: string | null;
  created_at: number;
}

interface WirePlan {
  id: string;
  period: string;
  interval: number;
  item: { name: string; amount: number; currency: string };
}

interface WireSubscription {
  id: string;
  plan_id: string;
  status: string;
  paid_count: number;
  total_count: number;
  charge_at: number | null;
  current_end: number | null;
  short_url: string;
}

interface WireSettlement {
  id: string;
  amount: number;
  fees: number;
  tax: number;
  utr: string;
  created_at: number;
  payment_ids: string[];
  refund_ids: string[];
  dispute_ids: string[];
}

function useAction(reload: () => void) {
  const [error, setError] = useState<string | null>(null);
  const run = (path: string) => {
    setError(null);
    api(path, { method: 'POST' }).then(reload, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  return { error, run };
}

export function LinksPage() {
  const links = useApi<{ items: WireLink[] }>('/payment-links');
  const customers = useApi<{ items: WireCustomer[] }>('/customers');
  const { error, run } = useAction(links.reload);
  return (
    <div className="grid gap-4">
      <Card title="Payment links">
        {(error ?? links.error) && <ErrorBox message={error ?? links.error ?? ''} />}
        {!links.data && !links.error && <Empty>Loading…</Empty>}
        {links.data?.items.length === 0 && <Empty>No payment links yet. Create one with POST /v1/payment_links.</Empty>}
        {links.data && links.data.items.length > 0 && (
          <Table head={['Link', 'Reference', 'Amount', 'Paid', 'Status', 'Expires', '']}>
            {links.data.items.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  <a className="font-mono text-lp-primary hover:underline" href={l.short_url} target="_blank" rel="noreferrer">
                    {l.id}
                  </a>
                </td>
                <td className="px-3 py-2">{l.reference_id || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatMoney(l.amount, l.currency)}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatMoney(l.amount_paid, l.currency)}</td>
                <td className="px-3 py-2">
                  <Badge status={l.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-lp-muted">{l.expire_by ? formatTime(l.expire_by) : 'never'}</td>
                <td className="px-3 py-2">
                  {(l.status === 'created' || l.status === 'partially_paid') && (
                    <Button variant="danger" onClick={() => run(`/payment-links/${l.id}/cancel`)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Customers">
        {customers.data?.items.length === 0 && <Empty>No customers yet.</Empty>}
        {customers.data && customers.data.items.length > 0 && (
          <Table head={['Customer', 'Name', 'Email', 'Contact', 'Created']}>
            {customers.data.items.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-mono">{c.id}</td>
                <td className="px-3 py-2">{c.name ?? '—'}</td>
                <td className="px-3 py-2">{c.email ?? '—'}</td>
                <td className="px-3 py-2">{c.contact ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-lp-muted">{formatTime(c.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

export function SubscriptionsPage() {
  const { data, error, reload } = useApi<{ plans: WirePlan[]; items: WireSubscription[] }>('/subscriptions');
  const action = useAction(reload);
  const plans = new Map(data?.plans.map((p) => [p.id, p]));
  return (
    <Card title="Subscriptions">
      {(action.error ?? error) && <ErrorBox message={action.error ?? error ?? ''} />}
      {!data && !error && <Empty>Loading…</Empty>}
      {data?.items.length === 0 && <Empty>No subscriptions yet. Create a plan and a subscription with the API, or run a subscription scenario.</Empty>}
      {data && data.items.length > 0 && (
        <Table head={['Subscription', 'Plan', 'Status', 'Paid', 'Next charge', '']}>
          {data.items.map((s) => {
            const plan = plans.get(s.plan_id);
            return (
              <tr key={s.id}>
                <td className="px-3 py-2">
                  <a className="font-mono text-lp-primary hover:underline" href={s.short_url} target="_blank" rel="noreferrer">
                    {s.id}
                  </a>
                </td>
                <td className="px-3 py-2">{plan ? `${plan.item.name} · ${formatMoney(plan.item.amount, plan.item.currency)} / ${plan.interval > 1 ? `${plan.interval} ` : ''}${plan.period}` : s.plan_id}</td>
                <td className="px-3 py-2">
                  <Badge status={s.status} />
                </td>
                <td className="px-3 py-2">
                  {s.paid_count} / {s.total_count}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-lp-muted">{s.charge_at ? formatTime(s.charge_at) : '—'}</td>
                <td className="px-3 py-2">
                  {!['cancelled', 'completed'].includes(s.status) && (
                    <Button variant="danger" onClick={() => action.run(`/subscriptions/${s.id}/cancel`)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-3 text-sm text-lp-muted">Renewals run on the emulator clock: use the Time screen to fast-forward through billing cycles.</p>
    </Card>
  );
}

export function SettlementsPage() {
  const { data, error } = useApi<{ items: WireSettlement[] }>('/settlements');
  return (
    <Card title="Settlements">
      {error && <ErrorBox message={error} />}
      {!data && !error && <Empty>Loading…</Empty>}
      {data?.items.length === 0 && <Empty>No settlements yet. Captured payments settle T+2 days later; fast-forward on the Time screen.</Empty>}
      {data && data.items.length > 0 && (
        <Table head={['Settlement', 'Net amount', 'Fees', 'Tax', 'UTR', 'Items', 'Created']}>
          {data.items.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 font-mono">{s.id}</td>
              <td className="whitespace-nowrap px-3 py-2 font-semibold">{formatMoney(s.amount)}</td>
              <td className="whitespace-nowrap px-3 py-2">{formatMoney(s.fees)}</td>
              <td className="whitespace-nowrap px-3 py-2">{formatMoney(s.tax)}</td>
              <td className="px-3 py-2 font-mono">{s.utr}</td>
              <td className="px-3 py-2 text-sm text-lp-muted">
                {s.payment_ids.length} payments, {s.refund_ids.length} refunds, {s.dispute_ids.length} disputes
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-lp-muted">{formatTime(s.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
