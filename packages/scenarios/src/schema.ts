// The scenario file format. YAML in, a validated Scenario out, with errors that point
// at the step and field that is wrong.
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const alias = z.string().regex(/^[a-z][a-z0-9_-]*$/i, { error: 'aliases are letters, digits, - and _' });
/** An alias defined by an earlier step, or "last" for the most recent of that kind. */
const ref = z.string().min(1);
const amount = z.number().int().min(100, { error: 'amounts are integers in paise, at least 100' });
const duration = z.string().regex(/^(?:\d+[smhdw])+$/, { error: 'durations look like 30s, 5m, 2h, 3d, 1w' });
const method = z.enum(['upi', 'card', 'netbanking', 'wallet']);
const weights = z.record(z.string(), z.number().min(0)).refine((w) => Object.values(w).some((v) => v > 0), { error: 'at least one outcome needs a weight above 0' });

const orderStep = z.strictObject({
  order: z.strictObject({
    amount,
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    receipt: z.string().max(40).optional(),
    notes: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    partial: z.boolean().optional(),
    auto_capture: z.boolean().optional(),
    as: alias.optional(),
  }),
});

const payStep = z.strictObject({
  pay: z
    .strictObject({
      order: ref.optional(),
      link: ref.optional(),
      method: method.default('upi'),
      scenario: z.string().optional(),
      outcomes: weights.optional(),
      amount: amount.optional(),
      vpa: z.string().optional(),
      as: alias.optional(),
    })
    .refine((p) => (p.order === undefined) !== (p.link === undefined), { error: 'pay needs exactly one of order or link' })
    .refine((p) => (p.scenario === undefined) !== (p.outcomes === undefined), { error: 'pay needs exactly one of scenario or outcomes' }),
});

const captureStep = z.strictObject({ capture: z.strictObject({ payment: ref }) });

const refundStep = z.strictObject({
  refund: z.strictObject({ payment: ref, amount: amount.optional(), speed: z.enum(['normal', 'optimum']).optional(), as: alias.optional() }),
});

const failRefundStep = z.strictObject({ fail_refund: z.strictObject({ refund: ref }) });
const processRefundStep = z.strictObject({ process_refund: z.strictObject({ refund: ref }) });
const advanceStep = z.strictObject({ advance: duration });

const linkStep = z.strictObject({
  link: z.strictObject({
    amount,
    reference_id: z.string().max(40).optional(),
    description: z.string().optional(),
    accept_partial: z.boolean().optional(),
    expire_in: duration.optional(),
    as: alias.optional(),
  }),
});

const cancelLinkStep = z.strictObject({ cancel_link: z.strictObject({ link: ref }) });

const customerStep = z.strictObject({
  customer: z.strictObject({ name: z.string().optional(), email: z.string().optional(), contact: z.string().optional(), as: alias.optional() }),
});

const faultsStep = z.strictObject({
  webhook_faults: z.strictObject({
    duplicate: z.number().min(0).max(1).optional(),
    out_of_order: z.number().min(0).max(1).optional(),
    unsigned: z.number().min(0).max(1).optional(),
    delay: z.number().int().min(0).optional(),
  }),
});

export type Step =
  | z.output<typeof orderStep>
  | z.output<typeof payStep>
  | z.output<typeof captureStep>
  | z.output<typeof refundStep>
  | z.output<typeof failRefundStep>
  | z.output<typeof processRefundStep>
  | z.output<typeof advanceStep>
  | z.output<typeof linkStep>
  | z.output<typeof cancelLinkStep>
  | z.output<typeof customerStep>
  | z.output<typeof faultsStep>
  | { repeat: { times: number; steps: Step[] } };

const stepSchema: z.ZodType<Step> = z.lazy(() =>
  z.union([
    orderStep,
    payStep,
    captureStep,
    refundStep,
    failRefundStep,
    processRefundStep,
    advanceStep,
    linkStep,
    cancelLinkStep,
    customerStep,
    faultsStep,
    z.strictObject({ repeat: z.strictObject({ times: z.number().int().min(1).max(1000), steps: z.array(stepSchema).min(1) }) }),
  ]),
);

const counts = z.record(z.string(), z.number().int().min(0));

export const scenarioSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  seed: z.union([z.string(), z.number()]).optional(),
  steps: z.array(stepSchema).min(1),
  expect: z
    .strictObject({
      /** Exact sequence of event types produced by the run. */
      events: z.array(z.string()).optional(),
      /** Event types that must appear, in this order, with others allowed between. */
      events_include: z.array(z.string()).optional(),
      orders: counts.optional(),
      payments: counts.optional(),
      refunds: counts.optional(),
      payment_links: counts.optional(),
    })
    .optional(),
});

export type Scenario = z.output<typeof scenarioSchema>;

export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

/** Parses and validates scenario YAML (or an already-parsed object). */
export function parseScenario(source: unknown): Scenario {
  let raw: unknown = source;
  if (typeof source === 'string') {
    try {
      raw = parseYaml(source);
    } catch (error) {
      throw new ScenarioError(`invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const result = scenarioSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ScenarioError(`${issue?.path.join('.') || 'scenario'}: ${issue?.message ?? 'invalid'}`);
  }
  return result.data;
}
