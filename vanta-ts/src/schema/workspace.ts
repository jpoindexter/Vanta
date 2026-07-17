import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  hashTaskTimeline,
  isCurrentBacktestCertification,
  runBacktest,
  type BacktestReport,
} from "./backtest.js";
import { readHypothesisLedger, type HypothesisLedger } from "./hypothesis.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import type { ModelSearchBudgets, SimulatedPlan } from "./model-planner.js";
import { inspectActiveTaskModel, TaskModelManifestSchema, type TaskModelArtifact } from "./task-model.js";
import { TaskTimelineRecordSchema, type TaskTimelineRecord, type TaskTransitionRecord } from "./timeline.js";

const BudgetSchema = z.object({
  maxExpanded: z.number().int().nonnegative(),
  maxDistinct: z.number().int().nonnegative(),
  maxDepth: z.number().int().nonnegative(),
  maxCost: z.number().nonnegative(),
});

const SimulatedPlanSchema = z.object({
  kind: z.literal("simulated_plan"),
  taskId: z.string().min(1),
  modelVersion: z.number().int().positive(),
  historyHash: z.string().regex(/^[a-f0-9]{64}$/),
  strategy: z.string().min(1),
  actions: z.array(z.unknown()),
  steps: z.array(z.object({
    action: z.unknown(), stateHash: z.string().regex(/^[a-f0-9]{64}$/), depth: z.number().int().positive(),
    cost: z.number().nonnegative(), terminal: z.boolean(),
  })),
  planCost: z.number().nonnegative(),
  terminalPrediction: z.literal(true),
});

export const SchemaWorkspaceManifestSchema = z.object({
  version: z.literal(1),
  snapshotId: z.string().regex(/^[a-f0-9]{24}$/),
  taskId: TaskModelManifestSchema.shape.taskId,
  createdAt: z.string().datetime(),
  modelVersion: z.number().int().positive(),
  certifiedAtSave: z.literal(true),
  timelineHash: z.string().regex(/^[a-f0-9]{64}$/),
  hypothesisLedgers: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), hash: z.string().regex(/^[a-f0-9]{64}$/) })),
  planHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  remainingBudgets: BudgetSchema,
  nextSafeAction: z.string().min(1).max(160),
  notes: z.array(z.string().min(1).max(500)).max(20),
});

const ActiveWorkspaceSchema = z.object({ version: z.literal(1), taskId: TaskModelManifestSchema.shape.taskId, snapshotId: z.string().regex(/^[a-f0-9]{24}$/) });

export type SchemaWorkspaceManifest = z.infer<typeof SchemaWorkspaceManifestSchema>;
export type SchemaWorkspaceDiagnosticCode =
  | "workspace_missing"
  | "workspace_invalid"
  | "timeline_stale"
  | "model_stale"
  | "hypothesis_stale"
  | "plan_stale"
  | "recertification_failed";
export type SchemaWorkspaceDiagnostic = { code: SchemaWorkspaceDiagnosticCode; message: string; nextSafeAction: "repair_workspace_and_recertify" };
export type RestoredSchemaWorkspace = {
  manifest: SchemaWorkspaceManifest;
  artifact: TaskModelArtifact;
  certification: BacktestReport;
  timeline: TaskTimelineRecord[];
  hypothesisLedgers: HypothesisLedger[];
  unresolvedHypotheses: Array<{ ledgerId: string; id: string; description: string }>;
  plan?: SimulatedPlan;
  lastCommittedTransition?: TaskTransitionRecord;
  remainingBudgets: ModelSearchBudgets;
  nextSafeAction: string;
  notes: string[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function manifestSnapshotId(manifest: Omit<SchemaWorkspaceManifest, "snapshotId" | "version" | "certifiedAtSave">): string {
  return hash(manifest).slice(0, 24);
}

function taskRoot(root: string, taskId: string): string {
  return join(root, "schema", "workspaces", taskId);
}

function snapshotRoot(root: string, taskId: string, snapshotId: string): string {
  return join(taskRoot(root, taskId), "snapshots", snapshotId);
}

function diagnostic(code: SchemaWorkspaceDiagnosticCode, message: string): { ok: false; diagnostic: SchemaWorkspaceDiagnostic } {
  return { ok: false, diagnostic: { code, message, nextSafeAction: "repair_workspace_and_recertify" } };
}

export async function saveSchemaWorkspace(options: {
  root: string;
  modelRoot: string;
  taskId: string;
  certification: BacktestReport;
  timeline: readonly TaskTimelineRecord[];
  hypothesisLedgerIds: readonly string[];
  plan?: SimulatedPlan;
  remainingBudgets: ModelSearchBudgets;
  nextSafeAction: string;
  notes: string[];
  createdAt?: string;
}): Promise<SchemaWorkspaceManifest> {
  const artifact = await inspectActiveTaskModel(options.modelRoot, options.taskId);
  if (!artifact) throw new Error("active task model is missing or invalid");
  z.array(TaskTimelineRecordSchema).parse(options.timeline);
  const timeline = [...options.timeline];
  const timelineHash = hashTaskTimeline(timeline);
  if (!isCurrentBacktestCertification(options.certification)) throw new Error("live complete-history certification is required");
  if (options.certification.modelVersion !== artifact.manifest.modelVersion) throw new Error("certification model version is stale");
  if (options.certification.timelineHash !== timelineHash) throw new Error("certification timeline hash is stale");
  const ledgers = await Promise.all(options.hypothesisLedgerIds.map((id) => readHypothesisLedger(options.root, id)));
  if (ledgers.some((ledger) => !ledger || ledger.taskId !== options.taskId)) throw new Error("hypothesis ledger is missing or belongs to another task");
  const plan = options.plan ? SimulatedPlanSchema.parse(options.plan) : undefined;
  if (plan && (plan.taskId !== options.taskId || plan.modelVersion !== artifact.manifest.modelVersion || plan.historyHash !== timelineHash)) {
    throw new Error("simulated plan is stale");
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  const content = {
    taskId: options.taskId,
    createdAt,
    modelVersion: artifact.manifest.modelVersion,
    timelineHash,
    hypothesisLedgers: ledgers.map((ledger) => ({ id: ledger!.id, hash: hash(ledger) })),
    ...(plan ? { planHash: hash(plan) } : {}),
    remainingBudgets: BudgetSchema.parse(options.remainingBudgets),
    nextSafeAction: options.nextSafeAction,
    notes: options.notes,
  };
  const snapshotId = manifestSnapshotId(content);
  const manifest = SchemaWorkspaceManifestSchema.parse({ version: 1, snapshotId, certifiedAtSave: true, ...content });
  const parent = taskRoot(options.root, options.taskId);
  const temporary = join(parent, "snapshots", `.${snapshotId}-${process.pid}-${Date.now()}.tmp`);
  const target = snapshotRoot(options.root, options.taskId, snapshotId);
  await mkdir(temporary, { recursive: true });
  try {
    await writeFile(join(temporary, "timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
    if (plan) await writeFile(join(temporary, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    await writeFile(join(temporary, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  const pointer = ActiveWorkspaceSchema.parse({ version: 1, taskId: options.taskId, snapshotId });
  const pointerTemp = join(parent, `.active-${process.pid}-${Date.now()}.tmp`);
  await writeFile(pointerTemp, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  await rename(pointerTemp, join(parent, "active.json"));
  return manifest;
}

export async function restoreSchemaWorkspace(options: {
  root: string;
  modelRoot: string;
  taskId: string;
  recordReceipt(receipt: ModelSandboxReceipt): Promise<void>;
}): Promise<{ ok: true; workspace: RestoredSchemaWorkspace } | { ok: false; diagnostic: SchemaWorkspaceDiagnostic }> {
  let pointer: z.infer<typeof ActiveWorkspaceSchema>;
  let manifest: SchemaWorkspaceManifest;
  try {
    pointer = ActiveWorkspaceSchema.parse(JSON.parse(await readFile(join(taskRoot(options.root, options.taskId), "active.json"), "utf8")));
    manifest = SchemaWorkspaceManifestSchema.parse(JSON.parse(await readFile(join(snapshotRoot(options.root, options.taskId, pointer.snapshotId), "manifest.json"), "utf8")));
    if (pointer.taskId !== options.taskId || manifest.taskId !== options.taskId || pointer.snapshotId !== manifest.snapshotId) throw new Error("workspace pointer does not match manifest");
    const { version: _version, snapshotId: _snapshotId, certifiedAtSave: _certifiedAtSave, ...content } = manifest;
    if (manifestSnapshotId(content) !== manifest.snapshotId) throw new Error("workspace manifest content hash is invalid");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnostic(/ENOENT/.test(message) ? "workspace_missing" : "workspace_invalid", message);
  }
  const directory = snapshotRoot(options.root, options.taskId, manifest.snapshotId);
  let timeline: TaskTimelineRecord[];
  try {
    const rawTimeline: unknown = JSON.parse(await readFile(join(directory, "timeline.json"), "utf8"));
    z.array(TaskTimelineRecordSchema).parse(rawTimeline);
    timeline = rawTimeline as TaskTimelineRecord[];
    if (hashTaskTimeline(timeline) !== manifest.timelineHash) return diagnostic("timeline_stale", "persisted timeline hash does not match the workspace manifest");
  } catch (error) { return diagnostic("timeline_stale", error instanceof Error ? error.message : String(error)); }
  const artifact = await inspectActiveTaskModel(options.modelRoot, options.taskId);
  if (!artifact || artifact.manifest.modelVersion !== manifest.modelVersion) return diagnostic("model_stale", "active model version does not match the workspace snapshot");
  const ledgers: HypothesisLedger[] = [];
  for (const reference of manifest.hypothesisLedgers) {
    const ledger = await readHypothesisLedger(options.root, reference.id);
    if (!ledger || ledger.taskId !== options.taskId || hash(ledger) !== reference.hash) return diagnostic("hypothesis_stale", `hypothesis ledger ${reference.id} is missing or changed`);
    ledgers.push(ledger);
  }
  let plan: SimulatedPlan | undefined;
  if (manifest.planHash) {
    try {
      const parsedPlan = SimulatedPlanSchema.parse(JSON.parse(await readFile(join(directory, "plan.json"), "utf8"))) as SimulatedPlan;
      if (hash(parsedPlan) !== manifest.planHash || parsedPlan.taskId !== options.taskId || parsedPlan.modelVersion !== manifest.modelVersion || parsedPlan.historyHash !== manifest.timelineHash) {
        return diagnostic("plan_stale", "persisted plan does not match the workspace snapshot");
      }
      plan = parsedPlan;
    } catch (error) { return diagnostic("plan_stale", error instanceof Error ? error.message : String(error)); }
  }
  const certification = await runBacktest({ artifact, timeline, recordReceipt: options.recordReceipt });
  if (!certification.certified) return diagnostic("recertification_failed", certification.firstCounterexample?.explanation ?? "complete-history backtest did not certify");
  const lastCommittedTransition = [...timeline].reverse().find((record): record is TaskTransitionRecord => record.kind === "task_transition");
  const unresolvedHypotheses = ledgers.flatMap((ledger) => ledger.hypotheses
    .filter((hypothesis) => hypothesis.status === "active")
    .map((hypothesis) => ({ ledgerId: ledger.id, id: hypothesis.id, description: hypothesis.description })));
  return {
    ok: true,
    workspace: {
      manifest, artifact, certification, timeline, hypothesisLedgers: ledgers, unresolvedHypotheses,
      plan, lastCommittedTransition, remainingBudgets: manifest.remainingBudgets,
      nextSafeAction: manifest.nextSafeAction, notes: manifest.notes,
    },
  };
}
