import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { gateSkill } from "../learning/eval-gate.js";
import type { Skill } from "../skills/types.js";
import {
  hashTaskTimeline,
  isCurrentBacktestCertification,
  runBacktest,
  type BacktestReport,
} from "./backtest.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskTimelineRecord } from "./timeline.js";

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/);
const TransitionRefSchema = z.object({ runId: z.string().min(1), sequence: z.number().int().positive() });
const CounterexampleSchema = TransitionRefSchema.extend({ path: z.string().min(1), explanation: z.string().min(1) });
const ReplaySchema = z.object({
  taskId: z.string().min(1),
  timelineHash: z.string().regex(/^[a-f0-9]{64}$/),
  transitions: z.number().int().positive(),
  exact: z.number().int().positive(),
  certified: z.literal(true),
});

export const MechanismArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().min(1),
  createdAt: z.string().datetime(),
  status: z.enum(["active", "scoped"]),
  scope: z.object({ excludedTaskIds: z.array(z.string().min(1)) }),
  supersedesVersion: z.number().int().positive().optional(),
  source: z.string().min(1),
  generatedTypes: z.string().min(1),
  origin: z.object({
    taskId: z.string().min(1),
    modelVersion: z.number().int().positive(),
    representationVersion: z.number().int().positive(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    timelineHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  evidence: z.object({
    supportingTransitions: z.array(TransitionRefSchema).min(1),
    counterexamples: z.array(CounterexampleSchema).min(1),
    heldOutReplays: z.array(ReplaySchema).min(1),
  }),
  adoption: z.object({ passed: z.literal(true), reason: z.string().min(1) }),
});

const ActivePointerSchema = z.object({ schemaVersion: z.literal(1), id: IdSchema, version: z.number().int().positive() });
const TransferReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  mechanismId: IdSchema,
  mechanismVersion: z.number().int().positive(),
  taskId: z.string().min(1),
  succeeded: z.boolean(),
  recordedAt: z.string().datetime(),
  counterexample: CounterexampleSchema.optional(),
});

export type MechanismArtifact = z.infer<typeof MechanismArtifactSchema>;
export type MechanismCounterexample = z.infer<typeof CounterexampleSchema>;
export type MechanismStats = {
  mechanisms: number;
  reuseAttempts: number;
  reused: number;
  regressions: number;
  reuseRate: number;
  regressionRate: number;
};
export type ProposeMechanismInput = {
  root: string;
  id: string;
  name: string;
  description: string;
  artifact: TaskModelArtifact;
  certification: BacktestReport;
  timeline: readonly TaskTimelineRecord[];
  supportingTransitions: Array<{ runId: string; sequence: number }>;
  counterexamples: MechanismCounterexample[];
  heldOut: Array<{ taskId: string; timeline: readonly TaskTimelineRecord[] }>;
  recordReceipt(receipt: ModelSandboxReceipt): Promise<void>;
  handAuthoredNames?: ReadonlySet<string>;
  createdAt?: string;
};
export type ProposeMechanismResult =
  | { ok: true; mechanism: MechanismArtifact; reports: BacktestReport[] }
  | { ok: false; code: "invalid_proposal" | "insufficient_evidence" | "stale_certification" | "held_out_failed" | "adoption_rejected" | "version_conflict"; reason: string; reports?: BacktestReport[] };

function mechanismRoot(root: string, id: string): string {
  return join(root, "schema", "mechanisms", id);
}

function versionPath(root: string, id: string, version: number): string {
  return join(mechanismRoot(root, id), "versions", `${String(version).padStart(4, "0")}.json`);
}

function transitionKey(value: { runId: string; sequence: number }): string {
  return `${value.runId}:${value.sequence}`;
}

function proposalSkill(input: ProposeMechanismInput, createdAt: string): Skill {
  return {
    meta: { name: input.id, description: input.description, created: createdAt, updated: createdAt, tags: ["vanta-learned", "schema-mechanism"] },
    body: `Reuse ${input.name} only when its grounded variables match. ${input.description} Replay held-out evidence and verify observed state after every transfer.`,
  };
}

async function persistMechanism(root: string, artifact: MechanismArtifact): Promise<boolean> {
  const directory = join(mechanismRoot(root, artifact.id), "versions");
  await mkdir(directory, { recursive: true });
  const target = versionPath(root, artifact.id, artifact.version);
  try {
    await writeFile(target, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  const pointer = ActivePointerSchema.parse({ schemaVersion: 1, id: artifact.id, version: artifact.version });
  const temporary = join(mechanismRoot(root, artifact.id), `.active-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(pointer, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, join(mechanismRoot(root, artifact.id), "active.json"));
  return true;
}

/** Promote only a live complete-history certification that also transfers to every held-out fixture. */
export async function proposeMechanism(input: ProposeMechanismInput): Promise<ProposeMechanismResult> {
  if (!IdSchema.safeParse(input.id).success || !input.name.trim() || !input.description.trim()) {
    return { ok: false, code: "invalid_proposal", reason: "mechanism identity and description are required" };
  }
  const supporting = new Set(input.timeline.filter((row) => row.kind === "task_transition").map(transitionKey));
  const modelSources = new Set(input.artifact.manifest.sourceTransitions.map(transitionKey));
  if (!input.supportingTransitions.length || !input.counterexamples.length || !input.heldOut.length
    || input.supportingTransitions.some((ref) => !supporting.has(transitionKey(ref)) || !modelSources.has(transitionKey(ref)))) {
    return { ok: false, code: "insufficient_evidence", reason: "supporting transitions, counterexamples, and held-out fixtures must cite model-owned evidence" };
  }
  const current = isCurrentBacktestCertification(input.certification)
    && input.certification.modelVersion === input.artifact.manifest.modelVersion
    && input.certification.timelineHash === hashTaskTimeline(input.timeline);
  if (!current) return { ok: false, code: "stale_certification", reason: "source task model lacks a current complete-history certification" };

  const reports: BacktestReport[] = [];
  for (const heldOut of input.heldOut) {
    const report = await runBacktest({ artifact: input.artifact, timeline: heldOut.timeline, recordReceipt: input.recordReceipt });
    reports.push(report);
    if (!report.certified || !isCurrentBacktestCertification(report)) {
      return { ok: false, code: "held_out_failed", reason: `held-out replay failed for ${heldOut.taskId}`, reports };
    }
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  const adoption = gateSkill(proposalSkill(input, createdAt), input.handAuthoredNames ?? new Set());
  if (!adoption.passed) return { ok: false, code: "adoption_rejected", reason: adoption.reason, reports };

  const prior = await readActiveMechanism(input.root, input.id);
  const mechanism = MechanismArtifactSchema.parse({
    schemaVersion: 1,
    id: input.id,
    version: (prior?.version ?? 0) + 1,
    name: input.name,
    description: input.description,
    createdAt,
    status: "active",
    scope: { excludedTaskIds: [] },
    ...(prior ? { supersedesVersion: prior.version } : {}),
    source: input.artifact.source,
    generatedTypes: input.artifact.generatedTypes,
    origin: {
      taskId: input.artifact.manifest.taskId,
      modelVersion: input.artifact.manifest.modelVersion,
      representationVersion: input.artifact.manifest.representationVersion,
      sourceHash: input.artifact.manifest.sourceHash,
      timelineHash: input.certification.timelineHash,
    },
    evidence: {
      supportingTransitions: input.supportingTransitions,
      counterexamples: input.counterexamples,
      heldOutReplays: reports.map((report, index) => ({
        taskId: input.heldOut[index]!.taskId,
        timelineHash: report.timelineHash,
        transitions: report.coverage.transitions,
        exact: report.coverage.exact,
        certified: true,
      })),
    },
    adoption: { passed: true, reason: adoption.reason },
  });
  return await persistMechanism(input.root, mechanism)
    ? { ok: true, mechanism, reports }
    : { ok: false, code: "version_conflict", reason: `mechanism version ${mechanism.version} already exists`, reports };
}

export async function readMechanismVersion(root: string, id: string, version: number): Promise<MechanismArtifact | undefined> {
  if (!IdSchema.safeParse(id).success || !Number.isInteger(version) || version < 1) return undefined;
  try { return MechanismArtifactSchema.parse(JSON.parse(await readFile(versionPath(root, id, version), "utf8"))); } catch { return undefined; }
}

export async function readActiveMechanism(root: string, id: string): Promise<MechanismArtifact | undefined> {
  if (!IdSchema.safeParse(id).success) return undefined;
  try {
    const pointer = ActivePointerSchema.parse(JSON.parse(await readFile(join(mechanismRoot(root, id), "active.json"), "utf8")));
    return pointer.id === id ? readMechanismVersion(root, id, pointer.version) : undefined;
  } catch { return undefined; }
}

async function mechanismIds(root: string): Promise<string[]> {
  try { return (await readdir(join(root, "schema", "mechanisms"), { withFileTypes: true })).filter((entry) => entry.isDirectory() && IdSchema.safeParse(entry.name).success).map((entry) => entry.name).sort(); } catch { return []; }
}

export async function retrieveMechanisms(root: string, input: { taskId: string; query?: string; limit?: number }): Promise<MechanismArtifact[]> {
  const query = (input.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const mechanisms = (await Promise.all((await mechanismIds(root)).map((id) => readActiveMechanism(root, id))))
    .filter((value): value is MechanismArtifact => Boolean(value))
    .filter((value) => !value.scope.excludedTaskIds.includes(input.taskId));
  return mechanisms.map((value) => {
    const haystack = `${value.id} ${value.name} ${value.description}`.toLowerCase();
    return { value, score: query.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0) };
  }).filter((row) => query.length === 0 || row.score > 0)
    .sort((left, right) => right.score - left.score || left.value.id.localeCompare(right.value.id))
    .slice(0, Math.max(1, input.limit ?? 5)).map((row) => row.value);
}

export async function recordMechanismTransfer(root: string, id: string, input: {
  taskId: string;
  succeeded: boolean;
  counterexample?: MechanismCounterexample;
  recordedAt?: string;
}): Promise<void> {
  const active = await readActiveMechanism(root, id);
  if (!active) throw new Error("active mechanism not found");
  if (!input.succeeded && !input.counterexample) throw new Error("failed transfer requires a counterexample");
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  if (!input.succeeded) {
    const revision = MechanismArtifactSchema.parse({
      ...active,
      version: active.version + 1,
      createdAt: recordedAt,
      status: "scoped",
      scope: { excludedTaskIds: [...new Set([...active.scope.excludedTaskIds, input.taskId])].sort() },
      supersedesVersion: active.version,
      evidence: { ...active.evidence, counterexamples: [...active.evidence.counterexamples, input.counterexample] },
    });
    if (!await persistMechanism(root, revision)) throw new Error(`mechanism version ${revision.version} already exists`);
  }
  const receipt = TransferReceiptSchema.parse({ schemaVersion: 1, mechanismId: id, mechanismVersion: active.version, taskId: input.taskId, succeeded: input.succeeded, recordedAt, counterexample: input.counterexample });
  const directory = join(mechanismRoot(root, id), "transfers");
  await mkdir(directory, { recursive: true });
  const receiptId = createHash("sha256").update(JSON.stringify(receipt)).digest("hex").slice(0, 24);
  await writeFile(join(directory, `${receiptId}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

export async function mechanismLibraryStats(root: string): Promise<MechanismStats> {
  const ids = await mechanismIds(root);
  const receipts = (await Promise.all(ids.map(async (id) => {
    try {
      const directory = join(mechanismRoot(root, id), "transfers");
      const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
      return (await Promise.all(files.map(async (file) => {
        try { return TransferReceiptSchema.parse(JSON.parse(await readFile(join(directory, file), "utf8"))); } catch { return undefined; }
      }))).filter((value): value is z.infer<typeof TransferReceiptSchema> => Boolean(value));
    } catch { return []; }
  }))).flat();
  const reused = receipts.filter((receipt) => receipt.succeeded).length;
  const regressions = receipts.length - reused;
  return {
    mechanisms: ids.length,
    reuseAttempts: receipts.length,
    reused,
    regressions,
    reuseRate: receipts.length ? reused / receipts.length : 0,
    regressionRate: receipts.length ? regressions / receipts.length : 0,
  };
}
