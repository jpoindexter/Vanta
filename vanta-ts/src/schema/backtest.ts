import { createHash } from "node:crypto";
import { GroundedStateSchema, type GroundedState } from "./grounding.js";
import { executeTaskModel, type ModelSandboxReceipt } from "./model-sandbox.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskTimelineRecord, TaskTransitionRecord } from "./timeline.js";

export type BacktestMismatchKind = "execution" | "state" | "terminal" | "representation";
export type BacktestMismatch = {
  runId: string;
  sequence: number;
  kind: BacktestMismatchKind;
  path: string;
  predicted: unknown;
  observed: unknown;
  explanation: string;
};
export type BacktestCoverage = {
  records: number;
  transitions: number;
  checked: number;
  exact: number;
  mismatched: number;
  partial: number;
  skipped: number;
  reset: number;
  uncheckable: number;
};
export type BacktestReport = {
  modelVersion: number;
  timelineHash: string;
  certified: boolean;
  coverage: BacktestCoverage;
  mismatches: BacktestMismatch[];
  firstCounterexample?: BacktestMismatch;
};

const certifiedReports = new WeakSet<BacktestReport>();

export function hashTaskTimeline(timeline: readonly TaskTimelineRecord[]): string {
  return createHash("sha256").update(JSON.stringify(timeline)).digest("hex");
}

export function isCurrentBacktestCertification(report: BacktestReport): boolean {
  return report.certified && certifiedReports.has(report);
}
export type RunBacktestOptions = {
  artifact: TaskModelArtifact;
  timeline: readonly TaskTimelineRecord[];
  recordReceipt(receipt: ModelSandboxReceipt): Promise<void>;
};

export type ValueMismatch = { path: string; predicted: unknown; observed: unknown };

export function findFirstValueMismatch(predicted: unknown, observed: unknown, path = "$" ): ValueMismatch | undefined {
  if (Object.is(predicted, observed)) return undefined;
  if (Array.isArray(predicted) && Array.isArray(observed)) {
    const length = Math.max(predicted.length, observed.length);
    for (let index = 0; index < length; index += 1) {
      const mismatch = findFirstValueMismatch(predicted[index], observed[index], `${path}[${index}]`);
      if (mismatch) return mismatch;
    }
    return undefined;
  }
  if (predicted && observed && typeof predicted === "object" && typeof observed === "object" && !Array.isArray(predicted) && !Array.isArray(observed)) {
    const left = predicted as Record<string, unknown>;
    const right = observed as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const mismatch = findFirstValueMismatch(left[key], right[key], `${path}.${key}`);
      if (mismatch) return mismatch;
    }
    return undefined;
  }
  return { path, predicted, observed };
}

function mismatch(
  record: TaskTransitionRecord,
  kind: BacktestMismatchKind,
  value: ValueMismatch,
  explanation: string,
): BacktestMismatch {
  return { runId: record.runId, sequence: record.sequence, kind, ...value, explanation };
}

function representationMismatch(
  record: TaskTransitionRecord,
  modelVersion: number,
  state: GroundedState,
): BacktestMismatch | undefined {
  return state.representationVersion === modelVersion ? undefined : mismatch(record, "representation", {
    path: "$.representationVersion",
    predicted: modelVersion,
    observed: state.representationVersion,
  }, "recorded state uses a different representation version than the model");
}

function initialCoverage(records: number): BacktestCoverage {
  return { records, transitions: 0, checked: 0, exact: 0, mismatched: 0, partial: 0, skipped: 0, reset: 0, uncheckable: 0 };
}

async function checkTransition(
  artifact: TaskModelArtifact,
  record: TaskTransitionRecord,
  prefix: readonly TaskTimelineRecord[],
  recordReceipt: RunBacktestOptions["recordReceipt"],
): Promise<BacktestMismatch[]> {
  const before = GroundedStateSchema.safeParse(record.before.snapshot);
  const after = GroundedStateSchema.safeParse(record.after);
  if (!before.success || !after.success) {
    return [mismatch(record, "state", { path: "$", predicted: "GroundedState", observed: "unparseable state" }, "transition state is not checkable")];
  }
  const stale = representationMismatch(record, artifact.manifest.representationVersion, before.data)
    ?? representationMismatch(record, artifact.manifest.representationVersion, after.data);
  if (stale) return [stale];
  const executed = await executeTaskModel({
    source: artifact.source,
    input: { state: before.data, action: record.action, timeline: prefix },
    recordReceipt,
  });
  if (!executed.ok) {
    return [mismatch(record, "execution", { path: "$.execution", predicted: "completed", observed: executed.receipt.status }, executed.error)];
  }
  const predicted = GroundedStateSchema.safeParse(executed.predicted);
  if (!predicted.success) {
    return [mismatch(record, "state", { path: "$", predicted: executed.predicted, observed: after.data }, "model returned an invalid GroundedState")];
  }
  const mismatches: BacktestMismatch[] = [];
  const value = findFirstValueMismatch(predicted.data, after.data);
  if (value) mismatches.push(mismatch(record, "state", value, "predicted state differs from recorded state"));
  const expectedGoal = record.status === "terminal";
  if (executed.goal !== expectedGoal) {
    mismatches.push(mismatch(record, "terminal", {
      path: "$.terminal",
      predicted: executed.goal,
      observed: expectedGoal,
    }, "goal predicate disagrees with the recorded terminal outcome"));
  }
  return mismatches;
}

/** Replay every checkable transition in order and refuse certification on incomplete or mismatched coverage. */
export async function runBacktest(options: RunBacktestOptions): Promise<BacktestReport> {
  const coverage = initialCoverage(options.timeline.length);
  const mismatches: BacktestMismatch[] = [];
  for (let index = 0; index < options.timeline.length; index += 1) {
    const record = options.timeline[index]!;
    if (record.kind === "task_marker") {
      if (record.status === "skipped") coverage.skipped += 1;
      else coverage.reset += 1;
      continue;
    }
    coverage.transitions += 1;
    if (record.status === "partial") {
      coverage.partial += 1;
      continue;
    }
    const transitionMismatches = await checkTransition(options.artifact, record, options.timeline.slice(0, index), options.recordReceipt);
    const uncheckable = transitionMismatches.some((item) => item.explanation === "transition state is not checkable");
    if (uncheckable) coverage.uncheckable += 1;
    else coverage.checked += 1;
    if (transitionMismatches.length) {
      coverage.mismatched += 1;
      mismatches.push(...transitionMismatches);
    } else {
      coverage.exact += 1;
    }
  }
  const certified = coverage.transitions > 0
    && coverage.exact === coverage.transitions
    && coverage.partial === 0
    && coverage.skipped === 0
    && coverage.uncheckable === 0
    && mismatches.length === 0;
  const report: BacktestReport = {
    modelVersion: options.artifact.manifest.modelVersion,
    timelineHash: hashTaskTimeline(options.timeline),
    certified,
    coverage,
    mismatches,
    ...(mismatches[0] ? { firstCounterexample: mismatches[0] } : {}),
  };
  if (report.certified) certifiedReports.add(report);
  return report;
}
