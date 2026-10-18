import { createEngine } from '@localpay/core';
import { findScenario, resolveScenario } from '@localpay/provider-razorpay';
import { describe, expect, it, vi } from 'vitest';
import { runScenario, type RunnerDeps } from './runner.ts';
import { parseScenario } from './schema.ts';

const deps = (overrides: Partial<RunnerDeps> = {}): RunnerDeps => ({
  engine: createEngine({ seed: 'runner' }),
  resolveOutcome: (name, input) => (findScenario(name) ? resolveScenario(name, input)?.outcome : undefined),
  ...overrides,
});

describe('runScenario', () => {
  it('runs steps with aliases and checks exact events and counts', () => {
    const result = runScenario(
      parseScenario(`
name: retry
steps:
  - order: { amount: 49900, as: tee }
  - pay: { order: tee, scenario: upi_timeout }
  - pay: { order: tee, scenario: success }
expect:
  events: [order.created, order.updated, payment.failed, order.updated, payment.authorized, payment.captured, order.paid]
  orders: { paid: 1 }
  payments: { failed: 1, captured: 1 }
`),
      deps(),
    );
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.at)).toEqual(['1', '2', '3']);
    expect(result.summary.payments).toEqual({ failed: 1, captured: 1 });
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it('reports failed expectations without throwing', () => {
    const result = runScenario(parseScenario({ name: 'x', steps: [{ order: { amount: 100 } }], expect: { orders: { paid: 1 }, events_include: ['order.paid'] } }), deps());
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual([
      { name: 'events_include', ok: false, detail: 'missing or out of order in order.created' },
      { name: 'orders.paid', ok: false, detail: 'expected 1, got 0' },
    ]);
  });

  it('stops at the first rejected step and says why', () => {
    const result = runScenario(parseScenario({ name: 'x', steps: [{ order: { amount: 100 } }, { pay: { order: 'last', scenario: 'success' } }, { pay: { order: 'last', scenario: 'success' } }, { order: { amount: 100 } }] }), deps());
    expect(result.ok).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({ at: '3', ok: false, detail: expect.stringContaining('already paid') as string });
    expect(result.steps).toHaveLength(3);
  });

  it('repeats steps and picks weighted outcomes deterministically', () => {
    const scenario = parseScenario({
      name: 'busy', seed: 'busy-1',
      steps: [{ repeat: { times: 20, steps: [{ order: { amount: 1000 } }, { pay: { order: 'last', outcomes: { success: 0.7, upi_timeout: 0.3 } } }] } }],
    });
    const a = runScenario(scenario, deps());
    const b = runScenario(scenario, deps());
    expect(a.summary.orders).toEqual(b.summary.orders);
    expect(a.steps.at(-1)?.at).toBe('1.20.2');
    expect((a.summary.payments.captured ?? 0) + (a.summary.payments.failed ?? 0)).toBe(20);
    expect(a.summary.payments.failed ?? 0).toBeGreaterThan(0);
  });

  it('only counts entities created by this run', () => {
    const engine = createEngine({ seed: 'busy-server' });
    engine.createOrder({ amount: 100 });
    const result = runScenario(parseScenario({ name: 'x', steps: [{ order: { amount: 200 } }], expect: { orders: { created: 1 } } }), deps({ engine }));
    expect(result.ok).toBe(true);
  });

  it('handles links, refunds, time and webhook faults', () => {
    const setFaults = vi.fn();
    const result = runScenario(
      parseScenario(`
name: mix
steps:
  - webhook_faults: { duplicate: 0.5, delay: 100 }
  - link: { amount: 10000, accept_partial: true, expire_in: 1d, as: inv }
  - pay: { link: inv, amount: 4000, scenario: success }
  - refund: { payment: last, amount: 1000, as: r }
  - fail_refund: { refund: r }
  - advance: 2d
expect:
  payment_links: { expired: 1 }
  refunds: { failed: 1 }
`),
      deps({ setFaults }),
    );
    expect(result.ok).toBe(true);
    expect(setFaults).toHaveBeenCalledWith({ duplicateRate: 0.5, delayMs: 100 });
  });

  it('rejects unknown outcome names', () => {
    const result = runScenario(parseScenario({ name: 'x', steps: [{ order: { amount: 100 } }, { pay: { order: 'last', scenario: 'teleport' } }] }), deps());
    expect(result.steps.at(-1)?.detail).toBe('unknown payment scenario "teleport"');
  });
});
