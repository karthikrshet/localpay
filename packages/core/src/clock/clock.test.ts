import { describe, expect, it } from 'vitest';
import { createManualClock, createOffsetClock, parseDuration, unixSeconds, type Clock } from './index.ts';

describe('createManualClock', () => {
  it('stays frozen until advanced', () => {
    const clock = createManualClock(1_000_000);
    expect(clock.now()).toBe(1_000_000);
    clock.advance(500);
    expect(clock.now()).toBe(1_000_500);
    expect(clock.offset()).toBe(500);
  });

  it('refuses to move backwards', () => {
    const clock = createManualClock(1000);
    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.set(999)).toThrow(RangeError);
    clock.set(5000);
    expect(clock.now()).toBe(5000);
  });
});

describe('createOffsetClock', () => {
  it('adds an offset to the base clock', () => {
    let real = 10_000;
    const base: Clock = { now: () => real };
    const clock = createOffsetClock(base);
    clock.advance(parseDuration('3d'));
    real += 1000;
    expect(clock.now()).toBe(10_000 + 1000 + 3 * 86_400_000);
    clock.set(clock.now() + 60_000);
    expect(clock.offset()).toBe(3 * 86_400_000 + 60_000);
  });
});

describe('unixSeconds', () => {
  it('floors milliseconds to seconds', () => {
    expect(unixSeconds(createManualClock(1_760_800_000_999))).toBe(1_760_800_000);
  });
});

describe('parseDuration', () => {
  it.each([
    ['45s', 45_000],
    ['30m', 1_800_000],
    ['2h', 7_200_000],
    ['3d', 259_200_000],
    ['1w', 604_800_000],
    ['1d12h', 129_600_000],
  ])('parses %s', (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it.each(['', '3', 'd', '3x', '-1d', '1.5h'])('rejects %j', (text) => {
    expect(() => parseDuration(text)).toThrow(RangeError);
  });
});
