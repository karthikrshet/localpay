// Scenario endpoints for the dashboard and the CLI: list the gallery, run a scenario
// (from the gallery or posted YAML) against the live engine.
import type { Engine } from '@localpay/core';
import { findScenario, resolveScenario } from '@localpay/provider-razorpay';
import { loadGallery, parseScenario, runScenario, ScenarioError, type ScenarioResult } from '@localpay/scenarios';
import type { Dispatcher } from '@localpay/webhooks';
import type { FastifyInstance } from 'fastify';

export interface ScenarioRoutesOptions {
  engine: Engine;
  dispatcher: Dispatcher;
  galleryDir?: string;
}

/** The run result without full event payloads, which can be large. */
export function compactResult(result: ScenarioResult) {
  return { ...result, events: result.events.map((e) => ({ seq: e.seq, id: e.id, type: e.type, at: e.at })) };
}

export function scenarioRoutes(app: FastifyInstance, options: ScenarioRoutesOptions): void {
  const gallery = () => loadGallery(options.galleryDir);

  app.get('/scenarios', (_request, reply) => reply.send({ items: gallery().map(({ id, name, description, yaml }) => ({ id, name, description, yaml })) }));

  app.post<{ Body: { id?: string; yaml?: string } }>('/scenarios/run', async (request, reply) => {
    const { id, yaml } = request.body ?? {};
    let scenario;
    try {
      if (id) {
        const entry = gallery().find((g) => g.id === id);
        if (!entry) return await reply.code(404).send({ error: { description: `no gallery scenario "${id}"` } });
        scenario = entry.scenario;
      } else if (typeof yaml === 'string') {
        scenario = parseScenario(yaml);
      } else {
        return await reply.code(400).send({ error: { description: 'send { id } for a gallery scenario or { yaml }' } });
      }
    } catch (error) {
      if (error instanceof ScenarioError) return reply.code(400).send({ error: { description: error.message } });
      throw error;
    }
    const result = runScenario(scenario, {
      engine: options.engine,
      resolveOutcome: (name, input) => (findScenario(name) ? resolveScenario(name, input)?.outcome : undefined),
      setFaults: (faults) => options.dispatcher.setFaults(faults),
    });
    await options.dispatcher.tick();
    return reply.send(compactResult(result));
  });
}
