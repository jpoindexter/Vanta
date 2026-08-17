import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { projectWorkItems } from "./projections.js";
import { loadBoards, loadRunLibrary, loadSessions } from "./operator-spine-activity.js";
import { contractLoaders, loadContinuityStore } from "./operator-spine-contracts.js";
import { loadSchedules, loadTeamTasks, loadTickets, loadWorkflowTasks } from "./operator-spine-legacy.js";
import { sha256, stable } from "./operator-spine-shared.js";
import type {
  LoadedSource,
  OperatorSourceReport,
  OperatorSpineSnapshot,
  OperatorViews,
  OperatorWorkItem,
} from "./operator-spine-types.js";
import type { Approval, Receipt, Run, WorkItem } from "./contract.js";

export type {
  OperatorSourceKind,
  OperatorSourceRef,
  OperatorSourceReport,
  OperatorSpineSnapshot,
  OperatorViews,
  OperatorWorkItem,
} from "./operator-spine-types.js";

type RelatedRecords = {
  runs: Run[];
  approvals: Approval[];
  receipts: Receipt[];
};

function resolveView(rows: WorkItem[], byId: Map<string, OperatorWorkItem>): OperatorWorkItem[] {
  return rows.flatMap((row) => {
    const record = byId.get(row.id);
    return record ? [record] : [];
  });
}

function projectOperatorItems(items: OperatorWorkItem[]): OperatorViews {
  const byView = projectWorkItems(items.map((record) => record.item));
  const byId = new Map(items.map((record) => [record.item.id, record]));
  return {
    captured: resolveView(byView.captured, byId),
    now: resolveView(byView.now, byId),
    waiting: resolveView(byView.waiting, byId),
    needsYou: resolveView(byView.needsYou, byId),
    done: resolveView(byView.done, byId),
  };
}

function linkedIds(record: OperatorWorkItem, related: RelatedRecords) {
  const workItemIds = new Set([record.item.id, record.source.id]);
  const linkedRuns = related.runs
    .filter((run) => workItemIds.has(run.workItemId))
    .map((run) => run.id);
  const runIds = [...new Set([...record.related.runIds, ...linkedRuns])].sort();
  const approvalIds = related.approvals
    .filter((approval) => workItemIds.has(approval.workItemId) || runIds.includes(approval.runId))
    .map((approval) => approval.id)
    .sort();
  const receiptIds = related.receipts
    .filter((receipt) => workItemIds.has(receipt.workItemId) || runIds.includes(receipt.runId))
    .map((receipt) => receipt.id)
    .sort();
  return { runIds, approvalIds, receiptIds };
}

function linkRecord(record: OperatorWorkItem, related: RelatedRecords): OperatorWorkItem {
  const ids = linkedIds(record, related);
  const currentRunId = record.item.runId && ids.runIds.includes(record.item.runId)
    ? record.item.runId
    : ids.runIds.at(-1);
  return {
    ...record,
    related: {
      ...ids,
      ...(currentRunId ? { currentRunId } : {}),
      currentAttempt: currentRunId ? ids.runIds.indexOf(currentRunId) + 1 : 0,
    },
  };
}

function collectSources(sources: LoadedSource[]) {
  const byId = <T extends { id: string }>(values: T[]): T[] =>
    values.sort((left, right) => left.id.localeCompare(right.id));
  const rawWorkItems = sources
    .flatMap((entry) => entry.projection.workItems ?? [])
    .sort((left, right) => left.item.id.localeCompare(right.item.id));
  return {
    rawWorkItems,
    runs: byId(sources.flatMap((entry) => entry.projection.runs ?? [])),
    approvals: byId(sources.flatMap((entry) => entry.projection.approvals ?? [])),
    receipts: byId(sources.flatMap((entry) => entry.projection.receipts ?? [])),
    reports: sources.map((entry) => entry.report),
  };
}

function sourceLoaders(root: string, home: string, dataDir: string): Promise<LoadedSource>[] {
  return [
    loadTeamTasks(home),
    loadWorkflowTasks(dataDir),
    loadTickets(dataDir),
    loadSchedules(dataDir),
    loadSessions(home),
    loadRunLibrary(home),
    loadBoards(root),
    loadContinuityStore(dataDir),
    ...contractLoaders(dataDir),
  ];
}

function integrity(reports: OperatorSourceReport[]): "ok" | "degraded" {
  return reports.some((report) => report.status === "degraded" || report.status === "unreadable")
    ? "degraded"
    : "ok";
}

export async function buildOperatorSpine(
  root: string,
  options: { env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<OperatorSpineSnapshot> {
  const home = resolveVantaHome(options.env ?? process.env);
  const dataDir = join(root, ".vanta");
  const collected = collectSources(await Promise.all(sourceLoaders(root, home, dataDir)));
  const related = {
    runs: collected.runs,
    approvals: collected.approvals,
    receipts: collected.receipts,
  };
  const workItems = collected.rawWorkItems.map((record) => linkRecord(record, related));
  const views = projectOperatorItems(workItems);
  const accomplishments = workItems.filter((record) => record.item.state === "verified");
  const payload = {
    workItems,
    runs: collected.runs,
    approvals: collected.approvals,
    receipts: collected.receipts,
    views,
    accomplishments,
    sources: collected.reports,
  };
  return {
    version: 1,
    readOnly: true,
    integrity: integrity(collected.reports),
    observedAt: (options.now ?? new Date()).toISOString(),
    ...payload,
    digest: sha256(stable(payload)),
  };
}

export function formatOperatorSpine(snapshot: OperatorSpineSnapshot): string {
  const lines = [
    `Operator spine: ${snapshot.integrity === "ok" ? "OK" : "DEGRADED"} (read-only)`,
    `Views: Captured ${snapshot.views.captured.length} · Now ${snapshot.views.now.length} · Waiting ${snapshot.views.waiting.length} · Needs You ${snapshot.views.needsYou.length} · Done ${snapshot.views.done.length}`,
    ...snapshot.sources.map((entry) => {
      const marker = entry.status === "ok" || entry.status === "missing" ? "-" : "!";
      const issue = entry.issues[0] ? ` — ${entry.issues[0]}` : "";
      return `  ${marker} ${entry.kind} ${entry.projectedCount}/${entry.sourceCount} ${entry.status}${issue}`;
    }),
    `Digest: ${snapshot.digest}`,
  ];
  return lines.join("\n");
}
