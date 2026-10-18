// Small shared pieces. All user data is rendered as text (React escapes it), never HTML.
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LocalPayEvent } from '../types.ts';

const TONES: Record<string, string> = {
  good: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  paid: 'good', captured: 'good', processed: 'good', delivered: 'good',
  attempted: 'warn', authorized: 'warn', pending: 'warn', retrying: 'warn',
  failed: 'bad', refunded: 'info', created: 'neutral',
};

export function Badge({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[STATUS_TONE[status] ?? 'neutral']}`}>{status}</span>;
}

export function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}

export const formatTime = (unixSeconds: number): string => new Date(unixSeconds * 1000).toLocaleString();
export const formatMs = (ms: number): string => new Date(ms).toLocaleString();

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-lp-border px-1.5 py-0.5 text-xs text-lp-muted hover:text-lp-ink"
      onClick={() => void navigator.clipboard?.writeText(value).then(() => setCopied(true))}
      aria-label={`${label}: ${value}`}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

export function Id({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="font-mono text-[0.92em]">{value}</code>
      <CopyButton value={value} />
    </span>
  );
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-lp-primary text-white hover:bg-lp-primary-hover border-transparent',
    secondary: 'bg-lp-surface text-lp-ink hover:border-lp-primary border-lp-border',
    danger: 'bg-lp-surface text-red-700 dark:text-red-400 hover:border-red-500 border-lp-border',
  }[variant];
  return <button type="button" className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles} ${className}`} {...props} />;
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-lp-border bg-lp-surface">
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-lp-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function JsonView({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-md bg-lp-canvas p-3 font-mono text-xs leading-relaxed">{JSON.stringify(value, null, 2)}</pre>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {message}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-lp-muted">{children}</p>;
}

export function Timeline({ events }: { events: LocalPayEvent[] }) {
  if (events.length === 0) return <Empty>No events yet.</Empty>;
  return (
    <ol className="space-y-2 border-l-2 border-lp-border pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-lp-accent" aria-hidden="true" />
          <div className="flex flex-wrap items-baseline gap-x-3">
            <code className="font-mono text-sm font-semibold">{event.type}</code>
            <span className="text-xs text-lp-muted">{formatMs(event.at)}</span>
            <span className="font-mono text-xs text-lp-muted">#{event.seq}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-lp-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-lp-border">{children}</tbody>
      </table>
    </div>
  );
}
