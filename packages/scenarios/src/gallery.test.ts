// Every gallery scenario must pass its own expectations and replay identically.
import { createEngine } from '@localpay/core';
import { findScenario, resolveScenario } from '@localpay/provider-razorpay';
import { describe, expect, it } from 'vitest';
import { loadGallery } from './gallery.ts';
import { runScenario } from './runner.ts';

const gallery = loadGallery();
const run = (entry: (typeof gallery)[number]) =>
  runScenario(entry.scenario, {
    engine: createEngine({ seed: entry.scenario.seed ?? entry.id }),
    resolveOutcome: (name, input) => (findScenario(name) ? resolveScenario(name, input)?.outcome : undefined),
  });

describe('scenario gallery', () => {
  it('has fifteen scenarios with descriptions', () => {
    expect(gallery).toHaveLength(15);
    for (const entry of gallery) expect(entry.description.length).toBeGreaterThan(40);
  });

  for (const entry of gallery) {
    it(`${entry.id} passes its expectations and replays identically`, () => {
      const first = run(entry);
      expect(first.steps.filter((s) => !s.ok)).toEqual([]);
      expect(first.checks.filter((c) => !c.ok)).toEqual([]);
      expect(first.ok).toBe(true);
      expect(run(entry).events).toEqual(first.events);
    });
  }

  it('returns an empty gallery for a missing directory', () => {
    expect(loadGallery('/nonexistent/dir')).toEqual([]);
  });
});
