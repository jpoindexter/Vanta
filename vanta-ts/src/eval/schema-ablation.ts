import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runEval } from "./run.js";
import type { EvalTask } from "./types.js";
import {
  SchemaAblationConfigSchema,
  SchemaAblationReportSchema,
  SchemaTrialMetricsSchema,
  SchemaTrialResultSchema,
  SchemaVariantSummarySchema,
  type SchemaAblationConfig,
  type SchemaAblationReport,
  type SchemaEvalBudgets,
  type SchemaEvalFixture,
  type SchemaHarnessVariant,
  type SchemaTrialMetrics,
  type SchemaTrialResult,
  type SchemaVariantSummary,
} from "./schema-ablation-types.js";

const HARNESS_PARTS = {
  timeline: "timeline backtest",
  commit: "commit gate",
  probes: "probe planning",
  search: "model search",
} as const;

export function harnessInstruction(variant: SchemaHarnessVariant): string {
  if (variant === "generic") return "Harness: generic agent workflow. Use the available tools and verify the requested outcome.";
  const disabled = new Set<string>();
  if (variant === "no_timeline_backtest") disabled.add(HARNESS_PARTS.timeline);
  if (variant === "no_commit_gate") disabled.add(HARNESS_PARTS.commit);
  if (variant === "no_probe_planning") disabled.add(HARNESS_PARTS.probes);
  if (variant === "no_model_search") disabled.add(HARNESS_PARTS.search);
  const settings = Object.values(HARNESS_PARTS).map((part) => `${part}: ${disabled.has(part) ? "disabled" : "enabled"}`);
  return `Harness: Schema. ${settings.join("; ")}. Keep simulation separate from real actions and preserve evidence.`;
}

type TrialDescriptor = { fixture: SchemaEvalFixture; variant: SchemaHarnessVariant; run: number; sessionId: string; taskId: string };

export type SchemaTrialRunnerInput = TrialDescriptor & {
  root: string;
  instruction: string;
  provider: string;
  model: string;
  tools: readonly string[];
  budgets: SchemaEvalBudgets;
};

export type SchemaTrialRunner = (trial: SchemaTrialRunnerInput) => Promise<SchemaTrialMetrics>;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

export function hashSchemaAblationConfig(config: SchemaAblationConfig): string {
  const parsed = SchemaAblationConfigSchema.parse(config);
  return createHash("sha256").update(JSON.stringify(stableValue(parsed))).digest("hex");
}

function sessionId(configHash: string, descriptor: Omit<TrialDescriptor, "sessionId" | "taskId">): string {
  const identity = `${configHash}:${descriptor.variant}:${descriptor.fixture.id}:${descriptor.run}`;
  return `schema-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

function descriptorsFor(config: SchemaAblationConfig, variant: SchemaHarnessVariant, configHash: string): TrialDescriptor[] {
  return config.fixtures.flatMap((fixture) => Array.from({ length: config.runsPerVariant }, (_, index) => {
    const run = index + 1;
    return { fixture, variant, run, sessionId: sessionId(configHash, { fixture, variant, run }), taskId: `${fixture.id}--run-${run}` };
  }));
}

function taskFor(descriptor: TrialDescriptor): EvalTask {
  return {
    id: descriptor.taskId,
    instruction: descriptor.fixture.instruction,
    seed: descriptor.fixture.seed,
    check: descriptor.fixture.check,
  };
}

function emptyMetrics(): SchemaTrialMetrics {
  return { inputTokens: 0, outputTokens: 0, toolCalls: 0, realActions: 0, costUsd: null, predictionAccuracy: null, recoveryAttempted: false, recoverySucceeded: false, transferAttempted: false, transferSucceeded: false };
}

function exceeded(metrics: SchemaTrialMetrics, budgets: SchemaEvalBudgets): SchemaTrialResult["budgetExceeded"] {
  const values: SchemaTrialResult["budgetExceeded"] = [];
  if (metrics.toolCalls > budgets.maxToolCalls) values.push("tool_calls");
  if (metrics.realActions > budgets.maxRealActions) values.push("real_actions");
  if (metrics.costUsd !== null && metrics.costUsd > budgets.maxCostUsd) values.push("cost_usd");
  return values;
}

function metricSummary(values: readonly (number | null)[]): SchemaVariantSummary["costUsd"] {
  const observed = values.filter((value): value is number => value !== null);
  if (!observed.length) return { observed: 0, mean: null, variance: null };
  const mean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
  const variance = observed.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / observed.length;
  return { observed: observed.length, mean, variance };
}

function rate(succeeded: number, attempted: number): number {
  return attempted ? succeeded / attempted : 0;
}

function summarize(variant: SchemaHarnessVariant, trials: readonly SchemaTrialResult[]): SchemaVariantSummary {
  const relevant = trials.filter((trial) => trial.variant === variant);
  const successes = relevant.filter((trial) => trial.success).length;
  const recoveryAttempted = relevant.filter((trial) => trial.metrics.recoveryAttempted).length;
  const recoverySucceeded = relevant.filter((trial) => trial.metrics.recoveryAttempted && trial.metrics.recoverySucceeded).length;
  const transferAttempted = relevant.filter((trial) => trial.metrics.transferAttempted).length;
  const transferSucceeded = relevant.filter((trial) => trial.metrics.transferAttempted && trial.metrics.transferSucceeded).length;
  return SchemaVariantSummarySchema.parse({
    variant,
    trials: relevant.length,
    successes,
    successRate: rate(successes, relevant.length),
    failures: relevant.filter((trial) => !trial.success).map((trial) => `${trial.fixtureId}#${trial.run}: ${trial.detail}`),
    realActions: metricSummary(relevant.map((trial) => trial.metrics.realActions)),
    toolCalls: metricSummary(relevant.map((trial) => trial.metrics.toolCalls)),
    costUsd: metricSummary(relevant.map((trial) => trial.metrics.costUsd)),
    predictionAccuracy: metricSummary(relevant.map((trial) => trial.metrics.predictionAccuracy)),
    recovery: { attempted: recoveryAttempted, succeeded: recoverySucceeded, rate: rate(recoverySucceeded, recoveryAttempted) },
    transfer: { attempted: transferAttempted, succeeded: transferSucceeded, rate: rate(transferSucceeded, transferAttempted) },
  });
}

function releaseEvidence(config: SchemaAblationConfig, trials: readonly SchemaTrialResult[]): SchemaAblationReport["releaseEvidence"] {
  const reasons: string[] = [];
  if (config.fixtures.some((fixture) => fixture.source !== "held_out")) reasons.push("Release evidence requires held-out fixtures; training/public fixtures are diagnostic only.");
  if (trials.some((trial) => trial.metrics.costUsd === null)) reasons.push("Cost is unpriced for one or more trials.");
  if (trials.some((trial) => trial.metrics.predictionAccuracy === null)) reasons.push("Prediction accuracy is missing for one or more trials.");
  for (const fixture of config.fixtures) {
    const relevant = trials.filter((trial) => trial.fixtureId === fixture.id);
    if (fixture.recoveryExpected && relevant.some((trial) => !trial.metrics.recoveryAttempted)) reasons.push(`Recovery was not exercised for fixture ${fixture.id}.`);
    if (fixture.transferExpected && relevant.some((trial) => !trial.metrics.transferAttempted)) reasons.push(`Transfer was not exercised for fixture ${fixture.id}.`);
  }
  if (!reasons.length) reasons.push("Evidence is reviewable; release remains an explicit operator decision.");
  return { reviewable: reasons.length === 1 && reasons[0]!.startsWith("Evidence is reviewable"), releaseClaimed: false, reasons };
}

export async function runSchemaAblationEval(options: { config: SchemaAblationConfig; baseDir: string; run: SchemaTrialRunner; createdAt?: string }): Promise<SchemaAblationReport> {
  const config = SchemaAblationConfigSchema.parse(options.config);
  const configHash = hashSchemaAblationConfig(config);
  const trials: SchemaTrialResult[] = [];
  for (const variant of config.variants) {
    const descriptors = descriptorsFor(config, variant, configHash);
    const observed = new Map<string, SchemaTrialMetrics>();
    let cursor = 0;
    const report = await runEval({
      tasks: descriptors.map(taskFor),
      baseDir: options.baseDir,
      rollouts: 1,
      run: async (instruction, root) => {
        const descriptor = descriptors[cursor++];
        if (!descriptor) throw new Error("schema eval descriptor underflow");
        const metrics = SchemaTrialMetricsSchema.parse(await options.run({
          ...descriptor,
          root,
          instruction: `${harnessInstruction(variant)}\n\n${instruction}`,
          provider: config.provider,
          model: config.model,
          tools: config.tools,
          budgets: config.budgets,
        }));
        observed.set(descriptor.taskId, metrics);
        return { outputTokens: metrics.outputTokens, iterations: metrics.toolCalls };
      },
    });
    for (const [index, descriptor] of descriptors.entries()) {
      const result = report.results[index]!;
      const metrics = observed.get(descriptor.taskId) ?? emptyMetrics();
      const budgetExceeded = exceeded(metrics, config.budgets);
      const success = result.pass && budgetExceeded.length === 0;
      const detail = budgetExceeded.length ? `budget exceeded: ${budgetExceeded.join(", ")}; ${result.detail}` : result.detail;
      trials.push(SchemaTrialResultSchema.parse({ fixtureId: descriptor.fixture.id, fixtureKind: descriptor.fixture.kind, variant, run: descriptor.run, sessionId: descriptor.sessionId, success, detail, metrics, budgetExceeded }));
    }
  }
  return SchemaAblationReportSchema.parse({
    version: 1,
    evalId: config.evalId,
    configHash,
    createdAt: options.createdAt ?? new Date().toISOString(),
    trials,
    summaries: config.variants.map((variant) => summarize(variant, trials)),
    releaseEvidence: releaseEvidence(config, trials),
  });
}

async function immutableWrite(path: string, content: string): Promise<void> {
  try {
    const existing = await readFile(path, "utf8");
    if (existing !== content) throw new Error(`immutable evidence conflict: ${path}`);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

export async function freezeSchemaAblationEvidence(root: string, configInput: SchemaAblationConfig, reportInput: SchemaAblationReport): Promise<{ directory: string; configPath: string; reportPath: string }> {
  const config = SchemaAblationConfigSchema.parse(configInput);
  const report = SchemaAblationReportSchema.parse(reportInput);
  const configHash = hashSchemaAblationConfig(config);
  if (report.evalId !== config.evalId || report.configHash !== configHash) throw new Error("immutable evidence conflict: report does not match config");
  const directory = join(root, ".vanta", "eval-runs", "schema", config.evalId);
  const configPath = join(directory, "config.json");
  const reportPath = join(directory, "report.json");
  await mkdir(directory, { recursive: true });
  await immutableWrite(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await immutableWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { directory, configPath, reportPath };
}
