import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SideEffectClassSchema } from "./task-environment.js";

const HypothesisStatusSchema = z.enum(["active", "rejected"]);
const RiskSchema = z.enum(["low", "medium", "high"]);
const PredictionMapSchema = z.record(z.string().min(1), z.unknown());

export const HypothesisSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().min(1),
  weight: z.number().positive(),
  status: HypothesisStatusSchema,
  supportingTransitionIds: z.array(z.string().min(1)),
  refutingTransitionIds: z.array(z.string().min(1)),
});

export const PlannedProbeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().min(1),
  action: z.unknown(),
  predictions: PredictionMapSchema,
  sideEffect: SideEffectClassSchema,
  reversible: z.boolean(),
  risk: RiskSchema,
  sideEffectCost: z.number().min(0).max(100),
  approvalRequired: z.boolean(),
  informationGain: z.number().min(0),
  score: z.number(),
});

const ProbeResultSchema = z.object({
  probeId: z.string().min(1),
  transitionId: z.string().min(1),
  evidenceAvailable: z.boolean(),
  observed: z.unknown().optional(),
  outcome: z.enum(["discriminating", "inconclusive"]),
  recordedAt: z.string().datetime(),
});

export const HypothesisLedgerSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-f0-9]{24}$/),
  taskId: z.string().min(1),
  sourceCounterexampleId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  createdAt: z.string().datetime(),
  hypotheses: z.array(HypothesisSchema).min(2),
  plannedProbes: z.array(PlannedProbeSchema).max(3),
  results: z.array(ProbeResultSchema),
});

export type HypothesisLedger = z.infer<typeof HypothesisLedgerSchema>;
export type PlannedProbe = z.infer<typeof PlannedProbeSchema>;
export type ProbeCandidate = Omit<PlannedProbe, "informationGain" | "score">;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createHypothesisLedger(input: {
  taskId: string;
  sourceCounterexampleId?: string;
  hypotheses: Array<{ id: string; description: string; weight: number }>;
  createdAt?: string;
}): HypothesisLedger {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const id = createHash("sha256").update(canonical({ taskId: input.taskId, hypotheses: input.hypotheses, createdAt })).digest("hex").slice(0, 24);
  return HypothesisLedgerSchema.parse({
    version: 1,
    id,
    taskId: input.taskId,
    sourceCounterexampleId: input.sourceCounterexampleId,
    createdAt,
    hypotheses: input.hypotheses.map((hypothesis) => ({
      ...hypothesis,
      status: "active",
      supportingTransitionIds: [],
      refutingTransitionIds: [],
    })),
    plannedProbes: [],
    results: [],
  });
}

function entropy(weights: readonly number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return 0;
  return weights.reduce((sum, weight) => {
    const probability = weight / total;
    return sum - probability * Math.log2(probability);
  }, 0);
}

function informationGain(ledger: HypothesisLedger, candidate: ProbeCandidate): number | undefined {
  const active = ledger.hypotheses.filter((hypothesis) => hypothesis.status === "active");
  if (active.length < 2 || active.some((hypothesis) => !(hypothesis.id in candidate.predictions))) return undefined;
  const partitions = new Map<string, number[]>();
  for (const hypothesis of active) {
    const key = canonical(candidate.predictions[hypothesis.id]);
    partitions.set(key, [...(partitions.get(key) ?? []), hypothesis.weight]);
  }
  if (partitions.size < 2) return undefined;
  const totalWeight = active.reduce((sum, hypothesis) => sum + hypothesis.weight, 0);
  const remaining = [...partitions.values()].reduce((sum, weights) => {
    const partitionWeight = weights.reduce((value, weight) => value + weight, 0);
    return sum + (partitionWeight / totalWeight) * entropy(weights);
  }, 0);
  return entropy(active.map((hypothesis) => hypothesis.weight)) - remaining;
}

const riskPenalty = { low: 0, medium: 12, high: 35 } as const;
const sideEffectPenalty = { none: 0, reversible: 4, external: 30 } as const;

export function planDiscriminatingProbes(
  ledger: HypothesisLedger,
  candidates: readonly ProbeCandidate[],
): { ledger: HypothesisLedger; probes: PlannedProbe[] } {
  const probes = candidates.flatMap((candidate) => {
    const parsed = PlannedProbeSchema.omit({ informationGain: true, score: true }).safeParse(candidate);
    if (!parsed.success) return [];
    const gain = informationGain(ledger, parsed.data);
    if (gain === undefined || gain <= 0) return [];
    const score = gain * 100
      - parsed.data.sideEffectCost
      - riskPenalty[parsed.data.risk]
      - sideEffectPenalty[parsed.data.sideEffect]
      - (parsed.data.approvalRequired ? 5 : 0)
      - (parsed.data.reversible ? 0 : 45);
    return [PlannedProbeSchema.parse({ ...parsed.data, informationGain: gain, score })];
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, 3);
  return { ledger: HypothesisLedgerSchema.parse({ ...ledger, plannedProbes: probes }), probes };
}

type ProbeEvidence = { available: false; reason: string } | { available: true; outcome: unknown };

export function adjudicateProbeResult(ledger: HypothesisLedger, input: {
  probeId: string;
  transitionId: string;
  evidence: ProbeEvidence;
  recordedAt?: string;
}): { ledger: HypothesisLedger; outcome: "discriminating" | "inconclusive" } {
  const probe = ledger.plannedProbes.find((candidate) => candidate.id === input.probeId);
  if (!probe) throw new Error("planned probe not found");
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  if (!input.evidence.available) {
    const result = { probeId: input.probeId, transitionId: input.transitionId, evidenceAvailable: false, outcome: "inconclusive" as const, recordedAt };
    return { ledger: HypothesisLedgerSchema.parse({ ...ledger, results: [...ledger.results, result] }), outcome: result.outcome };
  }
  const observed = canonical(input.evidence.outcome);
  const hypotheses = ledger.hypotheses.map((hypothesis) => {
    if (hypothesis.status !== "active") return hypothesis;
    const matched = canonical(probe.predictions[hypothesis.id]) === observed;
    return {
      ...hypothesis,
      status: matched ? "active" as const : "rejected" as const,
      supportingTransitionIds: matched ? [...hypothesis.supportingTransitionIds, input.transitionId] : hypothesis.supportingTransitionIds,
      refutingTransitionIds: matched ? hypothesis.refutingTransitionIds : [...hypothesis.refutingTransitionIds, input.transitionId],
    };
  });
  const result = { probeId: input.probeId, transitionId: input.transitionId, evidenceAvailable: true, observed: input.evidence.outcome, outcome: "discriminating" as const, recordedAt };
  return { ledger: HypothesisLedgerSchema.parse({ ...ledger, hypotheses, results: [...ledger.results, result] }), outcome: result.outcome };
}

function ledgerPath(root: string, id: string): string {
  return join(root, "schema", "hypotheses", `${id}.json`);
}

export async function writeHypothesisLedger(root: string, ledger: HypothesisLedger): Promise<void> {
  const parsed = HypothesisLedgerSchema.parse(ledger);
  const directory = join(root, "schema", "hypotheses");
  await mkdir(directory, { recursive: true });
  const target = ledgerPath(root, parsed.id);
  const temporary = join(directory, `.${parsed.id}-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function readHypothesisLedger(root: string, id: string): Promise<HypothesisLedger | undefined> {
  if (!/^[a-f0-9]{24}$/.test(id)) return undefined;
  try { return HypothesisLedgerSchema.parse(JSON.parse(await readFile(ledgerPath(root, id), "utf8"))); } catch { return undefined; }
}
