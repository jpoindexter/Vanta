import { join } from "node:path";
import {
  ApprovalSchema,
  ReceiptSchema,
  RunSchema,
  WorkItemSchema,
  type Approval,
  type Receipt,
  type Run,
  type WorkItem,
} from "./contract.js";
import {
  jsonLines,
  missing,
  readText,
  recordId,
  source,
  sourceReport,
} from "./operator-spine-shared.js";
import type {
  LoadedSource,
  OperatorSourceKind,
  OperatorWorkItem,
  Projection,
} from "./operator-spine-types.js";

type ContractKind = "work_item" | "effect_run" | "approval" | "receipt";

type ContinuityAccumulator = {
  sourceIds: string[];
  issues: string[];
  workItems: OperatorWorkItem[];
  runs: Run[];
  approvals: Approval[];
  receipts: Receipt[];
};

function parseContinuityRows<T>(input: {
  envelope: Record<string, unknown>;
  key: string;
  parse: (value: unknown) => { success: boolean; data?: T };
  accept: (value: T) => void;
  result: ContinuityAccumulator;
}): void {
  const rows = input.envelope[input.key];
  if (!Array.isArray(rows)) {
    input.result.issues.push(`missing ${input.key} array`);
    return;
  }
  rows.forEach((row, index) => {
    const fallback = `row-${index + 1}`;
    const rawId = row && typeof row === "object"
      ? recordId((row as Record<string, unknown>).id, fallback)
      : fallback;
    input.result.sourceIds.push(`${input.key}:${rawId}`);
    const parsed = input.parse(row);
    if (!parsed.success || !parsed.data) {
      input.result.issues.push(`${input.key} row ${index + 1} (${rawId}): invalid record`);
      return;
    }
    input.accept(parsed.data);
  });
}

function continuityWorkItem(item: WorkItem, path: string): OperatorWorkItem {
  return {
    source: source("continuity", item.id, path),
    related: {
      runIds: item.runId ? [item.runId] : [],
      ...(item.runId ? { currentRunId: item.runId } : {}),
      currentAttempt: item.runId ? 1 : 0,
      approvalIds: [],
      receiptIds: [],
    },
    item,
  };
}

function parseContinuityEnvelope(
  envelope: Record<string, unknown>,
  path: string,
): ContinuityAccumulator {
  const result: ContinuityAccumulator = {
    sourceIds: [], issues: [], workItems: [], runs: [], approvals: [], receipts: [],
  };
  parseContinuityRows({
    envelope, key: "items", parse: (value) => WorkItemSchema.safeParse(value), result,
    accept: (item) => result.workItems.push(continuityWorkItem(item, path)),
  });
  parseContinuityRows({
    envelope, key: "runs", parse: (value) => RunSchema.safeParse(value), result,
    accept: (value) => result.runs.push(value),
  });
  parseContinuityRows({
    envelope, key: "approvals", parse: (value) => ApprovalSchema.safeParse(value), result,
    accept: (value) => result.approvals.push(value),
  });
  parseContinuityRows({
    envelope, key: "receipts", parse: (value) => ReceiptSchema.safeParse(value), result,
    accept: (value) => result.receipts.push(value),
  });
  return result;
}

export async function loadContinuityStore(dataDir: string): Promise<LoadedSource> {
  const path = join(dataDir, "operator-work.json");
  const loaded = await readText(path);
  if (loaded.status === "missing") return missing("continuity", path);
  if (loaded.status === "unreadable") {
    return sourceReport({
      kind: "continuity", path, raw: "", sourceIds: [], projection: {},
      issues: [loaded.issue], status: "unreadable",
    });
  }
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(loaded.raw) as Record<string, unknown>;
  } catch {
    return sourceReport({
      kind: "continuity", path, raw: loaded.raw, sourceIds: ["store"],
      projection: {}, issues: ["invalid JSON"], status: "degraded",
    });
  }
  const result = parseContinuityEnvelope(envelope, path);
  return sourceReport({
    kind: "continuity",
    path,
    raw: loaded.raw,
    sourceIds: result.sourceIds,
    projection: {
      workItems: result.workItems,
      runs: result.runs,
      approvals: result.approvals,
      receipts: result.receipts,
    },
    issues: result.issues,
  });
}

function workItemProjection(values: WorkItem[], path: string): Projection {
  const latest = new Map<string, WorkItem>();
  for (const item of values) {
    const current = latest.get(item.id);
    if (!current || current.updatedAt <= item.updatedAt) latest.set(item.id, item);
  }
  return { workItems: [...latest.values()].map((item) => normalizeWorkItem(item, path)) };
}

function fallback<T>(value: T | null | undefined, alternative: T): T {
  return value ?? alternative;
}

function completionText(verified: boolean, complete: string, pending: string): string {
  return verified ? complete : pending;
}

function normalizeWorkItem(item: WorkItem, path: string): OperatorWorkItem {
  const verified = item.state === "verified";
  const runIds = item.runId ? [item.runId] : [];
  const followUp = completionText(
    verified,
    "No follow-up required",
    "Review when the source changes or the operator resumes it",
  );
  return {
    source: source("work_item", item.id, path),
    related: {
      runIds,
      ...(item.runId ? { currentRunId: item.runId } : {}),
      currentAttempt: item.runId ? 1 : 0,
      approvalIds: [],
      receiptIds: [],
    },
    item: {
      ...item,
      owner: fallback(item.owner, "unassigned"),
      waitCondition: fallback(item.waitCondition, completionText(verified, "No wait; outcome verified", "Source state changes")),
      nextAction: fallback(item.nextAction, completionText(verified, "Retain the verification evidence", `Review work_item ${item.id}`)),
      resumeContext: fallback(item.resumeContext, `Resume from work_item ${item.id}; the source remains authoritative and read-only.`),
      provenanceMemory: fallback(item.provenanceMemory, [{ source: item.source, sourceId: item.id, capturedAt: item.updatedAt }]),
      followUp: fallback(item.followUp, { condition: followUp }),
      timeCapacityFit: fallback(item.timeCapacityFit, {
        minutes: 10,
        capacity: {
          cognitive: "unknown", attentional: "unknown", sensory: "unknown",
          social: "unknown", emotional: "unknown", physical: "unknown", time: "unknown",
        },
      }),
      blocker: fallback(item.blocker, "No blocker reported by the source"),
      artifacts: fallback(item.artifacts, [{ kind: "file", ref: path }]),
    },
  };
}

function contractProjection(kind: ContractKind, values: unknown[], path: string): Projection {
  if (kind === "work_item") return workItemProjection(values as WorkItem[], path);
  if (kind === "effect_run") return { runs: values as Run[] };
  if (kind === "approval") return { approvals: values as Approval[] };
  return { receipts: values as Receipt[] };
}

export async function loadJsonlContract<T>(input: {
  kind: ContractKind;
  path: string;
  parse: (value: unknown) => T | null;
}): Promise<LoadedSource> {
  const loaded = await readText(input.path);
  if (loaded.status === "missing") return missing(input.kind, input.path);
  if (loaded.status === "unreadable") {
    return sourceReport({
      kind: input.kind, path: input.path, raw: "", sourceIds: [], projection: {},
      issues: [loaded.issue], status: "unreadable",
    });
  }
  const parsed = jsonLines(loaded.raw);
  const sourceIds: string[] = [];
  const values: T[] = [];
  const issues = [...parsed.issues];
  parsed.rows.forEach((row, index) => {
    const fallback = row && typeof row === "object"
      ? recordId((row as Record<string, unknown>).id, `row-${index + 1}`)
      : `row-${index + 1}`;
    sourceIds.push(fallback);
    const value = input.parse(row);
    if (value) values.push(value);
    else if (!parsed.issues.some((issue) => issue.startsWith(`row ${index + 1}:`))) {
      issues.push(`row ${index + 1} (${fallback}): invalid record`);
    }
  });
  return sourceReport({
    kind: input.kind,
    path: input.path,
    raw: loaded.raw,
    sourceIds,
    projection: contractProjection(input.kind, values, input.path),
    issues,
  });
}

export function contractLoaders(dataDir: string): Promise<LoadedSource>[] {
  const loader = <T>(
    kind: OperatorSourceKind & ContractKind,
    name: string,
    parse: (value: unknown) => T | null,
  ) => loadJsonlContract({ kind, path: join(dataDir, name), parse });
  return [
    loader("work_item", "work-items.jsonl", (value) =>
      WorkItemSchema.safeParse(value).success ? WorkItemSchema.parse(value) : null),
    loader("effect_run", "runs.jsonl", (value) =>
      RunSchema.safeParse(value).success ? RunSchema.parse(value) : null),
    loader("approval", "approvals.jsonl", (value) =>
      ApprovalSchema.safeParse(value).success ? ApprovalSchema.parse(value) : null),
    loader("receipt", "action-receipts.jsonl", (value) =>
      ReceiptSchema.safeParse(value).success ? ReceiptSchema.parse(value) : null),
  ];
}
