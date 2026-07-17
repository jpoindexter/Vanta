import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { isCurrentBacktestCertification, type BacktestReport } from "./backtest.js";
import type { ControlledCommitResult } from "./controlled-commit.js";
import { GroundedStateSchema } from "./grounding.js";
import type { ModelSearchReport } from "./model-planner.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskTimelineRecord } from "./timeline.js";

export const SchemaBeliefStatusSchema = z.enum(["exact", "partial", "untested", "contradicted"]);

const CountRateSchema = z.object({
  attempted: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
});

export const SchemaQualityScorecardSchema = z.object({
  version: z.literal(1),
  runId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  taskId: z.string().min(1),
  createdAt: z.string().datetime(),
  provenance: z.object({ modelVersion: z.number().int().positive(), representationVersion: z.number().int().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), timelineHash: z.string().regex(/^[a-f0-9]{64}$/) }),
  beliefStatus: SchemaBeliefStatusSchema,
  certified: z.boolean(),
  coverage: z.object({ exact: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), untested: z.number().int().nonnegative(), contradicted: z.number().int().nonnegative() }),
  predictionErrorsByField: z.array(z.object({ path: z.string().min(1), kind: z.string().min(1), count: z.number().int().positive() })),
  modelRevisions: z.number().int().nonnegative(),
  representationChanges: z.number().int().nonnegative(),
  probeCost: z.number().nonnegative(),
  simulatedSearch: z.object({ sandboxCalls: z.number().int().nonnegative(), expandedStates: z.number().int().nonnegative(), plansFound: z.number().int().nonnegative() }),
  realActions: z.object({ attempted: z.number().int().nonnegative(), committed: z.number().int().nonnegative(), verified: z.number().int().nonnegative(), efficiency: z.number().min(0).max(1) }),
  planAborts: z.number().int().nonnegative(),
  transfer: CountRateSchema,
});

export type SchemaQualityScorecard = z.infer<typeof SchemaQualityScorecardSchema>;
export type SchemaQualityAggregate = {
  runs: number;
  certifiedRuns: number;
  beliefs: Record<z.infer<typeof SchemaBeliefStatusSchema>, number>;
  simulatedSandboxCalls: number;
  realActionsAttempted: number;
  realActionsCommitted: number;
  realActionsVerified: number;
  committedActionEfficiency: number;
  probeCost: number;
  planAborts: number;
  transfers: { attempted: number; succeeded: number; rate: number };
};

function rate(succeeded: number, attempted: number): number {
  return attempted > 0 ? succeeded / attempted : 0;
}

function beliefStatus(report: BacktestReport): z.infer<typeof SchemaBeliefStatusSchema> {
  if (report.mismatches.length > 0 || report.coverage.mismatched > 0) return "contradicted";
  if (report.coverage.partial > 0 || report.coverage.skipped > 0 || report.coverage.uncheckable > 0) return "partial";
  if (isCurrentBacktestCertification(report) && report.certified && report.coverage.exact === report.coverage.transitions) return "exact";
  return "untested";
}

function changes(values: readonly number[]): number {
  return values.slice(1).reduce((count, value, index) => count + (value === values[index] ? 0 : 1), 0);
}

function representationHistory(timeline: readonly TaskTimelineRecord[], fallback: number): number[] {
  const values: number[] = [];
  for (const record of timeline) {
    if (record.kind !== "task_transition") continue;
    for (const raw of [record.before.snapshot, record.after]) {
      const parsed = GroundedStateSchema.safeParse(raw);
      if (parsed.success && values.at(-1) !== parsed.data.representationVersion) values.push(parsed.data.representationVersion);
    }
  }
  return values.length ? values : [fallback];
}

export type SchemaQualityScorecardInput = {
  runId: string;
  artifact: TaskModelArtifact;
  report: BacktestReport;
  timeline: readonly TaskTimelineRecord[];
  searches?: readonly ModelSearchReport[];
  commits?: readonly ControlledCommitResult[];
  realActionAttempts?: number;
  probeCosts?: readonly number[];
  planAborts?: number;
  transfer?: { attempted: number; succeeded: number };
  modelVersionHistory?: readonly number[];
  representationVersionHistory?: readonly number[];
  createdAt?: string;
};

export function createSchemaQualityScorecard(input: SchemaQualityScorecardInput): SchemaQualityScorecard {
  const status = beliefStatus(input.report);
  const errors = new Map<string, number>();
  for (const mismatch of input.report.mismatches) {
    const key = `${mismatch.kind}\u0000${mismatch.path}`;
    errors.set(key, (errors.get(key) ?? 0) + 1);
  }
  const predictionErrorsByField = [...errors.entries()].map(([key, count]) => {
    const [kind, path] = key.split("\u0000");
    return { kind: kind!, path: path!, count };
  }).sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
  const records = (input.commits ?? []).flatMap((result) => result.records);
  const attempted = Math.max(input.realActionAttempts ?? records.length, records.length);
  const verified = records.filter((record) => record.verification.ok).length;
  const searches = input.searches ?? [];
  const transfer = input.transfer ?? { attempted: 0, succeeded: 0 };
  const modelVersions = input.modelVersionHistory ?? [input.artifact.manifest.modelVersion];
  const representationVersions = input.representationVersionHistory ?? representationHistory(input.timeline, input.artifact.manifest.representationVersion);
  const untested = Math.max(0, input.report.coverage.transitions - input.report.coverage.checked - input.report.coverage.partial - input.report.coverage.uncheckable);
  return SchemaQualityScorecardSchema.parse({
    version: 1,
    runId: input.runId,
    taskId: input.artifact.manifest.taskId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    provenance: {
      modelVersion: input.artifact.manifest.modelVersion,
      representationVersion: input.artifact.manifest.representationVersion,
      sourceHash: input.artifact.manifest.sourceHash,
      timelineHash: input.report.timelineHash,
    },
    beliefStatus: status,
    certified: status === "exact",
    coverage: {
      exact: input.report.coverage.exact,
      partial: input.report.coverage.partial,
      skipped: input.report.coverage.skipped,
      untested,
      contradicted: input.report.coverage.mismatched,
    },
    predictionErrorsByField,
    modelRevisions: changes(modelVersions),
    representationChanges: changes(representationVersions),
    probeCost: (input.probeCosts ?? []).reduce((sum, cost) => sum + Math.max(0, cost), 0),
    simulatedSearch: {
      sandboxCalls: searches.reduce((sum, search) => sum + search.simulationCalls, 0),
      expandedStates: searches.reduce((sum, search) => sum + search.expandedStates, 0),
      plansFound: searches.filter((search) => search.ok && search.stopReason === "goal_found").length,
    },
    realActions: { attempted, committed: records.length, verified, efficiency: rate(verified, attempted) },
    planAborts: Math.max(0, input.planAborts ?? 0),
    transfer: { ...transfer, rate: rate(transfer.succeeded, transfer.attempted) },
  });
}

function scorecardPath(root: string, runId: string): string {
  return join(root, "schema", "quality", `${runId}.json`);
}

export async function recordSchemaQualityScorecard(root: string, scorecard: SchemaQualityScorecard): Promise<void> {
  const parsed = SchemaQualityScorecardSchema.parse(scorecard);
  const directory = join(root, "schema", "quality");
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${parsed.runId}-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await rename(temporary, scorecardPath(root, parsed.runId));
}

/** Canonical Schema-run finalizer: build the redacted receipt and persist it before returning. */
export async function finalizeSchemaRunQuality(root: string, input: SchemaQualityScorecardInput): Promise<SchemaQualityScorecard> {
  const scorecard = createSchemaQualityScorecard(input);
  await recordSchemaQualityScorecard(root, scorecard);
  return scorecard;
}

export async function readSchemaQualityScorecards(root: string): Promise<SchemaQualityScorecard[]> {
  try {
    const files = (await readdir(join(root, "schema", "quality"))).filter((file) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/.test(file)).sort();
    const values = await Promise.all(files.map(async (file) => {
      try { return SchemaQualityScorecardSchema.parse(JSON.parse(await readFile(join(root, "schema", "quality", file), "utf8"))); } catch { return undefined; }
    }));
    return values.filter((value): value is SchemaQualityScorecard => Boolean(value));
  } catch { return []; }
}

export function aggregateSchemaQuality(scorecards: readonly SchemaQualityScorecard[]): SchemaQualityAggregate {
  const aggregate: SchemaQualityAggregate = {
    runs: scorecards.length, certifiedRuns: 0, beliefs: { exact: 0, partial: 0, untested: 0, contradicted: 0 },
    simulatedSandboxCalls: 0, realActionsAttempted: 0, realActionsCommitted: 0, realActionsVerified: 0,
    committedActionEfficiency: 0, probeCost: 0, planAborts: 0, transfers: { attempted: 0, succeeded: 0, rate: 0 },
  };
  for (const scorecard of scorecards) {
    aggregate.certifiedRuns += scorecard.certified ? 1 : 0;
    aggregate.beliefs[scorecard.beliefStatus] += 1;
    aggregate.simulatedSandboxCalls += scorecard.simulatedSearch.sandboxCalls;
    aggregate.realActionsAttempted += scorecard.realActions.attempted;
    aggregate.realActionsCommitted += scorecard.realActions.committed;
    aggregate.realActionsVerified += scorecard.realActions.verified;
    aggregate.probeCost += scorecard.probeCost;
    aggregate.planAborts += scorecard.planAborts;
    aggregate.transfers.attempted += scorecard.transfer.attempted;
    aggregate.transfers.succeeded += scorecard.transfer.succeeded;
  }
  aggregate.committedActionEfficiency = rate(aggregate.realActionsVerified, aggregate.realActionsAttempted);
  aggregate.transfers.rate = rate(aggregate.transfers.succeeded, aggregate.transfers.attempted);
  return aggregate;
}

export function schemaQualityReceipt(scorecard: SchemaQualityScorecard): { kind: "schema_quality"; runId: string; belief: string; certified: boolean; summary: string } {
  return {
    kind: "schema_quality", runId: scorecard.runId, belief: scorecard.beliefStatus, certified: scorecard.certified,
    summary: `${scorecard.coverage.exact} exact · ${scorecard.coverage.partial} partial · ${scorecard.coverage.untested} untested · ${scorecard.coverage.contradicted} contradicted`,
  };
}

export function formatSchemaQualityForCli(scorecard: SchemaQualityScorecard): string {
  const receipt = schemaQualityReceipt(scorecard);
  return [`Schema quality: ${receipt.belief}${receipt.certified ? " · certified" : " · not certified"}`, receipt.summary, `Real actions: ${scorecard.realActions.verified}/${scorecard.realActions.attempted} verified · simulated calls: ${scorecard.simulatedSearch.sandboxCalls}`].join("\n");
}
