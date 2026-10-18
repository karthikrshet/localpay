import { describe, expect, it } from 'vitest';
import { CHECKOUT_SCENARIOS, findScenario, resolveScenario } from './scenarios.ts';

describe('checkout scenarios', () => {
  it('has the five buttons from the design, each with an effect line', () => {
    expect(CHECKOUT_SCENARIOS.map((s) => s.id)).toEqual(['success', 'insufficient_funds', 'bank_down', 'upi_timeout', 'authorize_only']);
    for (const scenario of CHECKOUT_SCENARIOS) expect(scenario.effect.length).toBeGreaterThan(10);
  });

  it('uses the SDKs\' error codes for failures', () => {
    const codes = CHECKOUT_SCENARIOS.flatMap((s) => (s.outcome.kind === 'fail' ? [s.outcome.error.code] : []));
    expect(new Set(codes)).toEqual(new Set(['BAD_REQUEST_ERROR', 'GATEWAY_ERROR']));
  });

  it('lets magic amounts win over the pressed button', () => {
    expect(resolveScenario('success', { amount: 10013, method: 'card' })?.id).toBe('bank_timeout');
    expect(resolveScenario('success', { amount: 10000, method: 'card' })?.id).toBe('success');
  });

  it('honours the published test VPAs for UPI only', () => {
    expect(resolveScenario('success', { amount: 100, method: 'upi', vpa: 'failure@razorpay' })?.id).toBe('insufficient_funds');
    expect(resolveScenario('bank_down', { amount: 100, method: 'upi', vpa: 'success@razorpay' })?.id).toBe('success');
    expect(resolveScenario('success', { amount: 100, method: 'card', vpa: 'failure@razorpay' })?.id).toBe('success');
  });

  it('returns undefined for unknown scenarios', () => {
    expect(findScenario('nope')).toBeUndefined();
    expect(resolveScenario('nope', { amount: 100, method: 'upi' })).toBeUndefined();
  });
});
