// Runs a scenario against an engine: in-process for tests and CI, or the live engine of a
// running server. Outcome names are resolved by the provider (checkout scenarios).
import { createRandom, EngineError, parseDuration, type AnyEvent, type Engine, type PaymentMethod, type PaymentOutcome, type Random } from '@localpay/core';
import type { Scenario, Step } from './schema.ts';

export interface RunnerDeps {
  engine: Engine;
  resolveOutcome: (name: string, input: { amount: number; method: PaymentMethod; vpa: string | null }) => PaymentOutcome | undefined;
  /** Applies webhook fault injection on the server, when the run has one. */
  setFaults?: (faults: { duplicateRate?: number; outOfOrderRate?: number; unsignedRate?: number; delayMs?: number }) => void;
}

export interface StepResult {
  /** Position, e.g. "3" or "5.2.1" inside repeats. */
  at: string;
  step: string;
  ok: boolean;
  detail: string;
}

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ScenarioResult {
  name: string;
  ok: boolean;
  events: AnyEvent[];
  steps: StepResult[];
  checks: Check[];
  /** Status counts for entities created by this run. */
  summary: Record<'orders' | 'payments' | 'refunds' | 'payment_links' | 'subscriptions' | 'disputes', Record<string, number>>;
}

type Kind = 'order' | 'payment' | 'refund' | 'link' | 'customer' | 'plan' | 'subscription' | 'dispute';

class Aliases {
  private readonly named = new Map<string, string>();
  private readonly last = new Map<Kind, string>();
  readonly created = new Map<Kind, string[]>();

  record(kind: Kind, id: string, alias?: string): void {
    this.last.set(kind, id);
    this.created.set(kind, [...(this.created.get(kind) ?? []), id]);
    if (alias) this.named.set(`${kind}:${alias}`, id);
  }

  resolve(kind: Kind, ref: string): string {
    const id = ref === 'last' ? this.last.get(kind) : this.named.get(`${kind}:${ref}`);
    if (!id) throw new EngineError('not_found', ref === 'last' ? `no ${kind} has been created yet` : `unknown ${kind} alias "${ref}"`);
    return id;
  }
}

function pickWeighted(weights: Record<string, number>, random: Random): string {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = random.next() * total;
  for (const [name, weight] of entries) {
    roll -= weight;
    if (roll < 0) return name;
  }
  return entries.at(-1)?.[0] ?? '';
}

const stepName = (step: Step): string => Object.keys(step)[0] ?? 'step';

export function runScenario(scenario: Scenario, deps: RunnerDeps): ScenarioResult {
  const { engine } = deps;
  const startSeq = engine.events.length;
  const random = createRandom(scenario.seed ?? scenario.name);
  const aliases = new Aliases();
  const steps: StepResult[] = [];

  const run = (step: Step): string => {
    if ('order' in step) {
      const o = step.order;
      const order = engine.createOrder({
        amount: o.amount,
        ...(o.currency && { currency: o.currency }),
        receipt: o.receipt ?? null,
        notes: o.notes ?? {},
        partialPayment: o.partial ?? false,
        autoCapture: o.auto_capture ?? null,
      });
      aliases.record('order', order.id, o.as);
      return order.id;
    }
    if ('pay' in step) {
      const p = step.pay;
      const orderId = p.link ? engine.getPaymentLink(aliases.resolve('link', p.link)).orderId : aliases.resolve('order', p.order ?? 'last');
      const order = engine.getOrder(orderId);
      const name = p.scenario ?? pickWeighted(p.outcomes ?? {}, random);
      const outcome = deps.resolveOutcome(name, { amount: p.amount ?? order.amount - order.amountPaid, method: p.method, vpa: p.vpa ?? null });
      if (!outcome) throw new EngineError('not_found', `unknown payment scenario "${name}"`);
      const payment = engine.attemptPayment({ orderId, method: p.method, outcome, ...(p.amount !== undefined && { amount: p.amount }), vpa: p.vpa ?? null });
      aliases.record('payment', payment.id, p.as);
      return `${payment.id} ${name} → ${payment.status}`;
    }
    if ('capture' in step) {
      const payment = engine.getPayment(aliases.resolve('payment', step.capture.payment));
      return `${engine.capturePayment(payment.id, { amount: payment.amount }).id} captured`;
    }
    if ('late_authorize' in step) {
      const payment = engine.lateAuthorize(aliases.resolve('payment', step.late_authorize.payment));
      return `${payment.id} late → ${payment.status}`;
    }
    if ('refund' in step) {
      const r = step.refund;
      const refund = engine.createRefund(aliases.resolve('payment', r.payment), { ...(r.amount !== undefined && { amount: r.amount }), ...(r.speed && { speed: r.speed }) });
      aliases.record('refund', refund.id, r.as);
      return `${refund.id} ${refund.status}`;
    }
    if ('process_refund' in step) return `${engine.processRefund(aliases.resolve('refund', step.process_refund.refund)).id} processed`;
    if ('fail_refund' in step) return `${engine.failRefund(aliases.resolve('refund', step.fail_refund.refund)).id} failed`;
    if ('advance' in step) return `${engine.advanceTime(parseDuration(step.advance))} scheduled change(s) ran`;
    if ('link' in step) {
      const l = step.link;
      const link = engine.createPaymentLink({
        amount: l.amount,
        referenceId: l.reference_id ?? null,
        description: l.description ?? null,
        ...(l.accept_partial !== undefined && { acceptPartial: l.accept_partial }),
        expireBy: l.expire_in ? engine.now() + parseDuration(l.expire_in) / 1000 : null,
      });
      aliases.record('link', link.id, l.as);
      aliases.record('order', link.orderId);
      return link.id;
    }
    if ('cancel_link' in step) return `${engine.cancelPaymentLink(aliases.resolve('link', step.cancel_link.link)).id} cancelled`;
    if ('customer' in step) {
      const c = step.customer;
      const customer = engine.createCustomer({ name: c.name ?? null, email: c.email ?? null, contact: c.contact ?? null }, { failExisting: false });
      aliases.record('customer', customer.id, c.as);
      return customer.id;
    }
    if ('plan' in step) {
      const p = step.plan;
      const plan = engine.createPlan({ period: p.period, interval: p.interval, item: { name: p.name, amount: p.amount } });
      aliases.record('plan', plan.id, p.as);
      return plan.id;
    }
    if ('subscription' in step) {
      const s = step.subscription;
      const subscription = engine.createSubscription({
        planId: aliases.resolve('plan', s.plan),
        totalCount: s.total_count,
        ...(s.quantity !== undefined && { quantity: s.quantity }),
        startAt: s.start_in ? engine.now() + parseDuration(s.start_in) / 1000 : null,
      });
      aliases.record('subscription', subscription.id, s.as);
      return subscription.id;
    }
    if ('authenticate' in step) {
      const a = step.authenticate;
      const subscription = engine.getSubscription(aliases.resolve('subscription', a.subscription));
      const outcome = deps.resolveOutcome(a.scenario, { amount: engine.authenticationAmount(subscription.id), method: a.method, vpa: null });
      if (!outcome) throw new EngineError('not_found', `unknown payment scenario "${a.scenario}"`);
      const result = engine.authenticateSubscription(subscription.id, { method: a.method, outcome });
      aliases.record('payment', result.payment.id);
      return `${subscription.id} ${a.scenario} → ${result.subscription.status}`;
    }
    if ('cancel_subscription' in step) {
      const c = step.cancel_subscription;
      return `${engine.cancelSubscription(aliases.resolve('subscription', c.subscription), { atCycleEnd: c.at_cycle_end ?? false }).status}`;
    }
    if ('dispute' in step) {
      const d = step.dispute;
      const dispute = engine.raiseDispute(aliases.resolve('payment', d.payment), {
        ...(d.amount !== undefined && { amount: d.amount }),
        ...(d.reason && { reasonCode: d.reason }),
        ...(d.respond_in_days !== undefined && { respondInDays: d.respond_in_days }),
      });
      aliases.record('dispute', dispute.id, d.as);
      return `${dispute.id} open`;
    }
    if ('accept_dispute' in step) return `${engine.acceptDispute(aliases.resolve('dispute', step.accept_dispute.dispute)).id} lost`;
    if ('contest_dispute' in step) {
      const c = step.contest_dispute;
      const dispute = engine.contestDispute(aliases.resolve('dispute', c.dispute), c.summary ? { summary: c.summary } : {}, { submit: c.submit });
      return `${dispute.id} ${dispute.status}`;
    }
    if ('resolve_dispute' in step) {
      const r = step.resolve_dispute;
      return `${engine.resolveDispute(aliases.resolve('dispute', r.dispute), r.outcome).id} ${r.outcome}`;
    }
    if ('webhook_faults' in step) {
      const f = step.webhook_faults;
      if (!deps.setFaults) return 'skipped: no webhook dispatcher in this run';
      deps.setFaults({
        ...(f.duplicate !== undefined && { duplicateRate: f.duplicate }),
        ...(f.out_of_order !== undefined && { outOfOrderRate: f.out_of_order }),
        ...(f.unsigned !== undefined && { unsignedRate: f.unsigned }),
        ...(f.delay !== undefined && { delayMs: f.delay }),
      });
      return 'webhook faults set';
    }
    return 'repeat';
  };

  const walk = (list: Step[], prefix: string): boolean => {
    for (const [index, step] of list.entries()) {
      const at = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      if ('repeat' in step) {
        for (let i = 1; i <= step.repeat.times; i++) if (!walk(step.repeat.steps, `${at}.${i}`)) return false;
        continue;
      }
      try {
        steps.push({ at, step: stepName(step), ok: true, detail: run(step) });
      } catch (error) {
        steps.push({ at, step: stepName(step), ok: false, detail: error instanceof Error ? error.message : String(error) });
        return false;
      }
    }
    return true;
  };
  const completed = walk(scenario.steps, '');

  const events = engine.events.slice(startSeq);
  const summary = summarise(engine, aliases);
  const checks = checkExpectations(scenario, events, summary);
  return { name: scenario.name, ok: completed && checks.every((c) => c.ok), events, steps, checks, summary };
}

function countBy<T extends { status: string }>(items: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

function summarise(engine: Engine, aliases: Aliases): ScenarioResult['summary'] {
  const ids = (kind: Kind) => aliases.created.get(kind) ?? [];
  const subscriptions = ids('subscription').map((id) => engine.getSubscription(id));
  // Subscription charges create their own orders; count those payments too.
  const orderIds = new Set([...ids('order'), ...subscriptions.flatMap((s) => s.paymentIds.map((p) => engine.getPayment(p).orderId ?? ''))]);
  const payments = engine.listPayments().filter((p) => p.orderId !== null && orderIds.has(p.orderId));
  const paymentIds = new Set(payments.map((p) => p.id));
  return {
    orders: countBy([...orderIds].map((id) => engine.getOrder(id))),
    payments: countBy(payments),
    refunds: countBy(engine.listRefunds().filter((r) => paymentIds.has(r.paymentId))),
    payment_links: countBy(ids('link').map((id) => engine.getPaymentLink(id))),
    subscriptions: countBy(subscriptions),
    disputes: countBy(ids('dispute').map((id) => engine.getDispute(id))),
  };
}

function isSubsequence(wanted: string[], actual: string[]): boolean {
  let i = 0;
  for (const type of actual) if (type === wanted[i]) i++;
  return i === wanted.length;
}

function checkExpectations(scenario: Scenario, events: AnyEvent[], summary: ScenarioResult['summary']): Check[] {
  const expect = scenario.expect;
  if (!expect) return [];
  const types = events.map((e) => e.type);
  const checks: Check[] = [];
  if (expect.events) {
    const ok = JSON.stringify(types) === JSON.stringify(expect.events);
    checks.push({ name: 'events', ok, detail: ok ? `${types.length} events in order` : `got ${types.join(', ')}` });
  }
  if (expect.events_include) {
    const ok = isSubsequence(expect.events_include, types);
    checks.push({ name: 'events_include', ok, detail: ok ? 'all present in order' : `missing or out of order in ${types.join(', ')}` });
  }
  for (const key of ['orders', 'payments', 'refunds', 'payment_links', 'subscriptions', 'disputes'] as const) {
    const wanted = expect[key];
    if (!wanted) continue;
    for (const [status, count] of Object.entries(wanted)) {
      const actual = summary[key][status] ?? 0;
      checks.push({ name: `${key}.${status}`, ok: actual === count, detail: `expected ${count}, got ${actual}` });
    }
  }
  return checks;
}
