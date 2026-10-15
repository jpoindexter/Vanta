import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { WorkItemState } from "./contract.js";
import type {
  LoadedSource,
  OperatorSourceKind,
  OperatorSourceRef,
  OperatorSourceReport,
  OperatorWorkItem,
  Projection,
  RawRecord,
} from "./operator-spine-types.js";

export const epoch = "1970-01-01T00:00:00.000Z";

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const stable = (value: unknown): string => JSON.stringify(sortValue(value));

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>);
  return Object.fromEntries(entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, sortValue(entry)]));
}

export const text = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

export const timestamp = (value: unknown): string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : epoch;

export const recordId = (value: unknown, fallback: string): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

export const source = (
  kind: OperatorSourceKind,
  id: string,
  path: string,
): OperatorSourceRef => ({ kind, id, path });

type OperatorItemInput = {
  outcome: string;
  state: WorkItemState;
  updatedAt?: string;
  owner?: string;
  waitCondition?: string;
  nextAction?: string;
  blocker?: string;
  resumeContext?: string;
  runId?: string;
};

const capacity = {
  cognitive: "unknown",
  attentional: "unknown",
  sensory: "unknown",
  social: "unknown",
  emotional: "unknown",
  physical: "unknown",
  time: "unknown",
} as const;

function relatedForRun(runId?: string): OperatorWorkItem["related"] {
  if (!runId) {
    return { runIds: [], currentAttempt: 0, approvalIds: [], receiptIds: [] };
  }
  return {
    runIds: [runId],
    currentRunId: runId,
    currentAttempt: 1,
    approvalIds: [],
    receiptIds: [],
  };
}

function defaultWait(state: WorkItemState): string {
  return state === "verified" ? "No wait; outcome verified" : "Source state changes";
}

function defaultNext(state: WorkItemState, ref: OperatorSourceRef): string {
  return state === "verified"
    ? "Retain the verification evidence"
    : `Review ${ref.kind} ${ref.id}`;
}

export function operatorItem(
  ref: OperatorSourceRef,
  input: OperatorItemInput,
): OperatorWorkItem {
  const updatedAt = timestamp(input.updatedAt);
  return {
    source: ref,
    related: relatedForRun(input.runId),
    item: {
      version: 1,
      id: `${ref.kind}:${ref.id}`,
      outcome: input.outcome,
      source: `${ref.kind}:${ref.id}`,
      state: input.state,
      ...(input.runId ? { runId: input.runId } : {}),
      owner: input.owner ?? "unassigned",
      waitCondition: input.waitCondition ?? defaultWait(input.state),
      nextAction: input.nextAction ?? defaultNext(input.state, ref),
      blocker: input.blocker ?? "No blocker reported by the source",
      resumeContext: input.resumeContext ?? `Resume from ${ref.kind} ${ref.id}; the source remains authoritative and read-only.`,
      provenanceMemory: [{ source: ref.kind, sourceId: ref.id, capturedAt: updatedAt }],
      followUp: {
        condition: input.state === "verified"
          ? "No follow-up required"
          : "Review when the source changes or the operator resumes it",
      },
      timeCapacityFit: { minutes: 10, capacity },
      artifacts: [{ kind: "file", ref: ref.path }],
      updatedAt,
    },
  };
}

type SourceReportInput = {
  kind: OperatorSourceKind;
  path: string;
  raw: string;
  sourceIds: string[];
  projection: Projection;
  issues: string[];
  status?: OperatorSourceReport["status"];
};

function projectedIds(projection: Projection): string[] {
  return [
    ...(projection.workItems ?? []).map((entry) => entry.source.id),
    ...(projection.runs ?? []).map((entry) => entry.id),
    ...(projection.approvals ?? []).map((entry) => entry.id),
    ...(projection.receipts ?? []).map((entry) => entry.id),
  ].sort();
}

export function sourceReport(input: SourceReportInput): LoadedSource {
  const projectionPayload = {
    workItems: input.projection.workItems ?? [],
    runs: input.projection.runs ?? [],
    approvals: input.projection.approvals ?? [],
    receipts: input.projection.receipts ?? [],
  };
  const projected = projectedIds(input.projection);
  return {
    report: {
      kind: input.kind,
      path: input.path,
      readOnly: true,
      status: input.status ?? (input.issues.length ? "degraded" : "ok"),
      sourceCount: input.sourceIds.length,
      projectedCount: projected.length,
      sourceIds: [...input.sourceIds].sort(),
      projectedIds: projected,
      sourceSha256: sha256(input.raw),
      projectionSha256: sha256(stable(projectionPayload)),
      issues: input.issues,
    },
    projection: input.projection,
  };
}

export function missing(kind: OperatorSourceKind, path: string): LoadedSource {
  return sourceReport({ kind, path, raw: "", sourceIds: [], projection: {}, issues: [], status: "missing" });
}

export async function readText(path: string): Promise<
  | { status: "present"; raw: string }
  | { status: "missing" }
  | { status: "unreadable"; issue: string }
> {
  try {
    return { status: "present", raw: await readFile(path, "utf8") };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT"
      ? { status: "missing" }
      : { status: "unreadable", issue: `${code ?? "ERROR"}: unreadable` };
  }
}

export function jsonArray(raw: string, key?: string): { rows: unknown[]; issue?: string } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = key && parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)[key]
      : parsed;
    return Array.isArray(rows)
      ? { rows }
      : { rows: [], issue: key ? `missing ${key} array` : "expected array" };
  } catch {
    return { rows: [], issue: "invalid JSON" };
  }
}

export function jsonLines(raw: string): { rows: unknown[]; issues: string[] } {
  const rows: unknown[] = [];
  const issues: string[] = [];
  raw.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    try {
      rows.push(JSON.parse(line));
    } catch {
      rows.push({});
      issues.push(`row ${index + 1}: invalid JSON`);
    }
  });
  return { rows, issues };
}

export async function objectFileSource(input: {
  kind: OperatorSourceKind;
  path: string;
  key?: string;
  project: (record: RawRecord) => OperatorWorkItem | null;
}): Promise<LoadedSource> {
  const loaded = await readText(input.path);
  if (loaded.status === "missing") return missing(input.kind, input.path);
  if (loaded.status === "unreadable") {
    return sourceReport({
      kind: input.kind,
      path: input.path,
      raw: "",
      sourceIds: [],
      projection: {},
      issues: [loaded.issue],
      status: "unreadable",
    });
  }
  const parsed = jsonArray(loaded.raw, input.key);
  const issues = parsed.issue ? [parsed.issue] : [];
  const sourceIds: string[] = [];
  const workItems: OperatorWorkItem[] = [];
  parsed.rows.forEach((value, index) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const id = recordId(row.id, `row-${index + 1}`);
    sourceIds.push(id);
    const projected = input.project({ id, value: row });
    if (projected) workItems.push(projected);
    else issues.push(`row ${index + 1} (${id}): invalid record`);
  });
  return sourceReport({
    kind: input.kind,
    path: input.path,
    raw: loaded.raw,
    sourceIds,
    projection: { workItems },
    issues,
  });
}
