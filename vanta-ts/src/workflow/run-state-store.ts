import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { GraphRunStateSchema, migrateGraphRunState, type GraphAgentEvidence, type GraphArtifactRef, type GraphNodeResult, type GraphRunState } from "./run-state.js";

export class GraphRunConflictError extends Error {}

export type GraphRunCommit = {
  expectedRevision: number;
  nodeId: string;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  result: GraphNodeResult;
  writes?: Record<string, unknown>;
  artifacts?: GraphArtifactRef[];
  evidence?: GraphAgentEvidence[];
  usage?: { tokens?: number; costUsd?: number };
};

export function graphRunStatePath(dataDir: string, runId: string): string {
  return join(dataDir, "workflow-runs", `${safeRunId(runId)}.json`);
}

export async function loadGraphRunState(dataDir: string, runId: string): Promise<GraphRunState | null> {
  const raw = await readFile(graphRunStatePath(dataDir, runId), "utf8").catch(() => "");
  if (!raw) return null;
  return migrateGraphRunState(JSON.parse(raw));
}

export async function createGraphRunState(dataDir: string, state: GraphRunState): Promise<GraphRunState> {
  return withRunLock(dataDir, state.runId, async () => {
    const existing = await loadGraphRunState(dataDir, state.runId);
    if (existing) return existing;
    await writeAtomic(graphRunStatePath(dataDir, state.runId), state);
    return state;
  });
}

export async function commitGraphRunNode(dataDir: string, runId: string, commit: GraphRunCommit): Promise<GraphRunState> {
  return withRunLock(dataDir, runId, async () => {
    const current = await requiredState(dataDir, runId);
    rejectConflicts(current, commit);
    const next = applyGraphRunCommit(current, commit);
    await writeAtomic(graphRunStatePath(dataDir, runId), next);
    return next;
  });
}

export async function updateGraphRun(dataDir: string, runId: string, update: (state: GraphRunState) => GraphRunState): Promise<GraphRunState> {
  return withRunLock(dataDir, runId, async () => {
    const current = await requiredState(dataDir, runId);
    const next = GraphRunStateSchema.parse(update(current));
    await writeAtomic(graphRunStatePath(dataDir, runId), next);
    return next;
  });
}

export function applyGraphRunCommit(current: GraphRunState, commit: GraphRunCommit): GraphRunState {
  const revision = current.revision + 1;
  const writes = commit.writes ?? {};
  const fields = Object.keys(writes).sort();
  return GraphRunStateSchema.parse({
    ...current, revision, updatedAt: commit.finishedAt,
    values: { ...current.values, ...writes },
    fieldRevisions: { ...current.fieldRevisions, ...Object.fromEntries(fields.map((field) => [field, revision])) },
    results: { ...current.results, [commit.nodeId]: commit.result },
    transcript: [...current.transcript, commit.result],
    attempts: [...current.attempts, { nodeId: commit.nodeId, attempt: commit.attempt, startedAt: commit.startedAt, finishedAt: commit.finishedAt, status: commit.result.status }],
    artifacts: mergeArtifacts(current.artifacts, commit.artifacts ?? []),
    evidence: [...current.evidence, ...(commit.evidence ?? []).map((item) => ({ ...item, nodeId: commit.nodeId, at: commit.finishedAt }))],
    budget: updatedBudget(current, commit, fields.length > 0),
    mutations: fields.length ? [...current.mutations, { nodeId: commit.nodeId, attempt: commit.attempt, revision, fields, at: commit.finishedAt }] : current.mutations,
  });
}

function updatedBudget(current: GraphRunState, commit: GraphRunCommit, wroteState: boolean): GraphRunState["budget"] {
  const progress = wroteState || Boolean(commit.artifacts?.length) || Boolean(commit.evidence?.length);
  return {
    ...current.budget,
    usedUsd: current.budget.usedUsd + (commit.usage?.costUsd ?? 0),
    usedTokens: current.budget.usedTokens + (commit.usage?.tokens ?? 0),
    noProgressSteps: progress ? 0 : current.budget.noProgressSteps + 1,
  };
}

function rejectConflicts(current: GraphRunState, commit: GraphRunCommit): void {
  const changed = Object.keys(commit.writes ?? {}).filter((field) => (current.fieldRevisions[field] ?? 0) > commit.expectedRevision);
  if (changed.length) throw new GraphRunConflictError(`state conflict on ${changed.sort().join(", ")}`);
}

function mergeArtifacts(current: GraphArtifactRef[], incoming: GraphArtifactRef[]): GraphArtifactRef[] {
  const merged = new Map(current.map((artifact) => [artifact.id, artifact]));
  for (const artifact of incoming) merged.set(artifact.id, artifact);
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

async function requiredState(dataDir: string, runId: string): Promise<GraphRunState> {
  const state = await loadGraphRunState(dataDir, runId);
  if (!state) throw new Error(`graph run not found: ${runId}`);
  return state;
}

async function writeAtomic(path: string, state: GraphRunState): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function withRunLock<T>(dataDir: string, runId: string, operation: () => Promise<T>): Promise<T> {
  const lock = `${graphRunStatePath(dataDir, runId)}.lock`;
  await mkdir(dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 5_000;
  while (true) {
    try { await mkdir(lock); break; } catch {
      if (Date.now() >= deadline) throw new Error(`timed out waiting for graph run lock: ${runId}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  try { return await operation(); } finally { await rm(lock, { recursive: true, force: true }); }
}

function safeRunId(runId: string): string {
  if (!/^[a-zA-Z0-9_.:-]+$/.test(runId)) throw new Error("invalid graph run id");
  return runId;
}
