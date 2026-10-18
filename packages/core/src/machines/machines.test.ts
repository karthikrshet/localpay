import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, InvalidTransitionError } from './index.ts';

describe('state machines', () => {
  it.each([
    ['order', 'created', 'attempted'],
    ['order', 'attempted', 'paid'],
    ['payment', 'created', 'authorized'],
    ['payment', 'authorized', 'captured'],
    ['payment', 'captured', 'refunded'],
    ['payment', 'failed', 'authorized'],
    ['refund', 'pending', 'processed'],
  ] as const)('allows %s %s → %s', (machine, from, to) => {
    expect(canTransition(machine, from as never, to as never)).toBe(true);
  });

  it.each([
    ['order', 'paid', 'attempted'],
    ['payment', 'captured', 'authorized'],
    ['payment', 'failed', 'captured'],
    ['payment', 'refunded', 'captured'],
    ['refund', 'processed', 'pending'],
    ['refund', 'failed', 'processed'],
  ] as const)('forbids %s %s → %s', (machine, from, to) => {
    expect(canTransition(machine, from as never, to as never)).toBe(false);
    expect(() => assertTransition(machine, from as never, to as never)).toThrow(InvalidTransitionError);
  });

  it('treats staying in the same status as allowed', () => {
    expect(canTransition('payment', 'captured', 'captured')).toBe(true);
  });

  it('reports the machine and statuses in the error', () => {
    try {
      assertTransition('payment', 'failed', 'captured');
    } catch (error) {
      expect(error).toMatchObject({ machine: 'payment', from: 'failed', to: 'captured' });
      expect((error as Error).message).toBe('payment cannot move from failed to captured');
    }
  });
});
