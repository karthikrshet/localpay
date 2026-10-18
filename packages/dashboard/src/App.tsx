import { useEffect, useState, type ReactNode } from 'react';
import { api, LiveContext, setCsrf } from './api.ts';
import { Card, Empty, ErrorBox } from './components/ui.tsx';
import { Home } from './pages/Home.tsx';
import { OrderDetail, OrdersPage } from './pages/Orders.tsx';
import { PaymentDetail, PaymentsPage } from './pages/Payments.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { TimePage } from './pages/Time.tsx';
import { WebhooksPage } from './pages/Webhooks.tsx';
import { Link, match, usePath } from './router.tsx';
import type { Session } from './types.ts';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/orders', label: 'Orders' },
  { to: '/payments', label: 'Payments' },
  { to: '/webhooks', label: 'Webhooks' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/time', label: 'Time' },
  { to: '/settings', label: 'Settings' },
];

/** Re-renders views when the server reports a change, at most every 250 ms. */
function useLiveUpdates(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      timer ??= setTimeout(() => {
        timer = null;
        setVersion((v) => v + 1);
      }, 250);
    };
    const source = new EventSource('/_localpay/api/stream');
    for (const type of ['event', 'delivery', 'reset']) source.addEventListener(type, bump);
    return () => {
      source.close();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return version;
}

export function route(path: string, session: Session): ReactNode {
  const order = match('/orders/:id', path);
  if (order?.id) return <OrderDetail id={order.id} />;
  const payment = match('/payments/:id', path);
  if (payment?.id) return <PaymentDetail id={payment.id} />;
  switch (path) {
    case '/':
      return <Home session={session} />;
    case '/orders':
      return <OrdersPage />;
    case '/payments':
      return <PaymentsPage />;
    case '/webhooks':
      return <WebhooksPage />;
    case '/scenarios':
      return (
        <Card title="Scenarios">
          <Empty>The scenario runner arrives with the scenario engine.</Empty>
        </Card>
      );
    case '/time':
      return <TimePage />;
    case '/settings':
      return <SettingsPage />;
    default:
      return <Empty>Page not found.</Empty>;
  }
}

export function App() {
  const path = usePath();
  const live = useLiveUpdates();
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Session>('/session').then(
      (s) => {
        setCsrf(s.csrf);
        setSession(s);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [live]);

  return (
    <LiveContext.Provider value={live}>
      <div className="min-h-screen">
        <header className="border-b border-lp-border bg-lp-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link to="/" className="inline-flex items-center gap-2 text-lg font-bold">
              <span className="h-3.5 w-3.5 rounded-full bg-lp-accent" aria-hidden="true" />
              LocalPay
            </Link>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">TEST MODE · no real money</span>
            <nav aria-label="Main" className="flex flex-wrap gap-1">
              {NAV.map((item) => {
                const active = item.to === '/' ? path === '/' : path.startsWith(item.to);
                return (
                  <Link key={item.to} to={item.to} ariaCurrent={active} className={`rounded-md px-3 py-1.5 ${active ? 'bg-lp-canvas font-semibold text-lp-primary' : 'text-lp-muted hover:text-lp-ink'}`}>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
          {error && <ErrorBox message={error} />}
          {session ? route(path, session) : !error && <Empty>Loading…</Empty>}
        </main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-lp-muted">LocalPay is an independent open-source test tool, not affiliated with or endorsed by Razorpay.</footer>
      </div>
    </LiveContext.Provider>
  );
}
