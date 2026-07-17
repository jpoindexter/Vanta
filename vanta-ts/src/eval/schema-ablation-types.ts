import { z } from "zod";
import { CheckSchema } from "./types.js";

export const SchemaHarnessVariantSchema = z.enum([
  "generic",
  "schema_full",
  "no_timeline_backtest",
  "no_commit_gate",
  "no_probe_planning",
  "no_model_search",
]);
export type SchemaHarnessVariant = z.infer<typeof SchemaHarnessVariantSchema>;

export const REQUIRED_SCHEMA_VARIANTS = SchemaHarnessVariantSchema.options;

export const SchemaEvalFixtureSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  kind: z.enum(["repo_repair", "browser_workflow", "operator_task"]),
  instruction: z.string().min(1),
  seed: z.record(z.string()).optional(),
  check: CheckSchema,
  source: z.enum(["held_out", "training", "public"]),
  recoveryExpected: z.boolean().default(false),
  transferExpected: z.boolean().default(false),
});
export type SchemaEvalFixture = z.infer<typeof SchemaEvalFixtureSchema>;

export const SchemaEvalBudgetsSchema = z.object({
  maxToolCalls: z.number().int().positive(),
  maxRealActions: z.number().int().positive(),
  maxCostUsd: z.number().positive(),
});
export type SchemaEvalBudgets = z.infer<typeof SchemaEvalBudgetsSchema>;

export const SchemaAblationConfigSchema = z.object({
  version: z.literal(1),
  evalId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  createdAt: z.string().datetime(),
  provider: z.string().min(1),
  model: z.string().min(1),
  tools: z.array(z.string().min(1)).min(1),
  budgets: SchemaEvalBudgetsSchema,
  runsPerVariant: z.number().int().min(2),
  fixtures: z.array(SchemaEvalFixtureSchema).min(3),
  variants: z.array(SchemaHarnessVariantSchema).length(REQUIRED_SCHEMA_VARIANTS.length),
}).superRefine((config, ctx) => {
  const variants = new Set(config.variants);
  for (const variant of REQUIRED_SCHEMA_VARIANTS) {
    if (!variants.has(variant)) ctx.addIssue({ code: "custom", path: ["variants"], message: `missing required variant: ${variant}` });
  }
  const kinds = new Set(config.fixtures.map((fixture) => fixture.kind));
  for (const kind of ["repo_repair", "browser_workflow", "operator_task"] as const) {
    if (!kinds.has(kind)) ctx.addIssue({ code: "custom", path: ["fixtures"], message: `missing required fixture kind: ${kind}` });
  }
});
export type SchemaAblationConfig = z.infer<typeof SchemaAblationConfigSchema>;

export const SchemaTrialMetricsSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  realActions: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
  predictionAccuracy: z.number().min(0).max(1).nullable(),
  recoveryAttempted: z.boolean(),
  recoverySucceeded: z.boolean(),
  transferAttempted: z.boolean(),
  transferSucceeded: z.boolean(),
});
export type SchemaTrialMetrics = z.infer<typeof SchemaTrialMetricsSchema>;

export const SchemaTrialResultSchema = z.object({
  fixtureId: z.string().min(1),
  fixtureKind: SchemaEvalFixtureSchema.shape.kind,
  variant: SchemaHarnessVariantSchema,
  run: z.number().int().positive(),
  sessionId: z.string().min(1),
  success: z.boolean(),
  detail: z.string(),
  metrics: SchemaTrialMetricsSchema,
  budgetExceeded: z.array(z.enum(["tool_calls", "real_actions", "cost_usd"])),
});
export type SchemaTrialResult = z.infer<typeof SchemaTrialResultSchema>;

const MetricSummarySchema = z.object({
  observed: z.number().int().nonnegative(),
  mean: z.number().nullable(),
  variance: z.number().nullable(),
});

export const SchemaVariantSummarySchema = z.object({
  variant: SchemaHarnessVariantSchema,
  trials: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  failures: z.array(z.string()),
  realActions: MetricSummarySchema,
  toolCalls: MetricSummarySchema,
  costUsd: MetricSummarySchema,
  predictionAccuracy: MetricSummarySchema,
  recovery: z.object({ attempted: z.number().int().nonnegative(), succeeded: z.number().int().nonnegative(), rate: z.number().min(0).max(1) }),
  transfer: z.object({ attempted: z.number().int().nonnegative(), succeeded: z.number().int().nonnegative(), rate: z.number().min(0).max(1) }),
});
export type SchemaVariantSummary = z.infer<typeof SchemaVariantSummarySchema>;

export const SchemaAblationReportSchema = z.object({
  version: z.literal(1),
  evalId: z.string().min(1),
  configHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  trials: z.array(SchemaTrialResultSchema),
  summaries: z.array(SchemaVariantSummarySchema),
  releaseEvidence: z.object({
    reviewable: z.boolean(),
    releaseClaimed: z.literal(false),
    reasons: z.array(z.string()),
  }),
});
export type SchemaAblationReport = z.infer<typeof SchemaAblationReportSchema>;
