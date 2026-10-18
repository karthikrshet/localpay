import { describe, expect, it } from 'vitest';
import { parseScenario, ScenarioError } from './schema.ts';

describe('parseScenario', () => {
  it('parses a scenario with every step type', () => {
    const scenario = parseScenario(`
name: everything
seed: 7
steps:
  - customer: { name: Asha, as: asha }
  - order: { amount: 49900, as: tee, auto_capture: false }
  - pay: { order: tee, scenario: authorize_only }
  - capture: { payment: last }
  - refund: { payment: last, amount: 1000, as: r1 }
  - process_refund: { refund: r1 }
  - fail_refund: { refund: r1 }
  - link: { amount: 5000, accept_partial: true, expire_in: 1h, as: inv }
  - pay: { link: inv, outcomes: { success: 0.7, upi_timeout: 0.3 } }
  - cancel_link: { link: inv }
  - advance: 3d
  - webhook_faults: { duplicate: 0.2 }
  - repeat:
      times: 3
      steps:
        - order: { amount: 100 }
expect:
  events_include: [order.created]
  orders: { paid: 1 }
`);
    expect(scenario.steps).toHaveLength(13);
    expect(scenario.seed).toBe(7);
  });

  it('defaults the payment method to upi', () => {
    const scenario = parseScenario({ name: 'x', steps: [{ pay: { order: 'last', scenario: 'success' } }] });
    expect(scenario.steps[0]).toEqual({ pay: { order: 'last', scenario: 'success', method: 'upi' } });
  });

  it.each([
    ['not: [valid', /invalid YAML/],
    ['name: x\nsteps: []', /steps/],
    ['name: x\nsteps:\n  - teleport: {}', /steps\.0/],
    ['name: x\nsteps:\n  - order: { amount: 99.5 }', /steps\.0/],
    ['name: x\nsteps:\n  - advance: soon', /steps\.0/],
  ])('rejects %j', (yaml, message) => {
    expect(() => parseScenario(yaml)).toThrow(ScenarioError);
    expect(() => parseScenario(yaml)).toThrow(message);
  });
});
