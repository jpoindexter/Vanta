import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { sanitizePreferenceContext } from "../preferences/signals.js";
import { resolveVantaHome } from "../store/home.js";

const FILE = "operator-beliefs.json";

export const BeliefFacetSchema = z.enum([
  "communication",
  "workflow",
  "autonomy",
  "risk",
  "goals",
  "preferences",
  "relationship",
]);
export const BeliefStatusSchema = z.enum(["hypothesis", "accepted", "rejected", "superseded"]);
export const BeliefEvidenceSchema = z.object({
  timestamp: z.string().datetime(),
  kind: z.enum(["self_report", "observation", "correction", "approval_signal", "dialectic"]),
  sourceRef: z.string().min(1),
  excerpt: z.string().min(1).max(240),
});
export const OperatorBeliefSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1).max(240),
  facet: BeliefFacetSchema,
  status: BeliefStatusSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(BeliefEvidenceSchema),
  revisionOf: z.string().optional(),
  supersededBy: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const BeliefStoreSchema = z.object({ version: z.literal(1), beliefs: z.array(OperatorBeliefSchema) });

export type BeliefFacet = z.infer<typeof BeliefFacetSchema>;
export type BeliefStatus = z.infer<typeof BeliefStatusSchema>;
export type BeliefEvidence = z.infer<typeof BeliefEvidenceSchema>;
export type OperatorBelief = z.infer<typeof OperatorBeliefSchema>;
export type BeliefStore = z.infer<typeof BeliefStoreSchema>;

type MutationDeps = { now?: Date; id?: () => string };

export function beliefsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), FILE);
}

export async function loadBeliefStore(env: NodeJS.ProcessEnv = process.env): Promise<BeliefStore> {
  try {
    const parsed = BeliefStoreSchema.safeParse(JSON.parse(await readFile(beliefsPath(env), "utf8")));
    return parsed.success ? parsed.data : { version: 1, beliefs: [] };
  } catch {
    return { version: 1, beliefs: [] };
  }
}

export async function saveBeliefStore(store: BeliefStore, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const parsed = BeliefStoreSchema.parse(store);
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(beliefsPath(env), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export function activeBeliefs(store: BeliefStore): OperatorBelief[] {
  return store.beliefs
    .filter((belief) => belief.status === "accepted" || (belief.status === "hypothesis" && belief.confidence >= 0.55))
    .sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.confidence - a.confidence || b.updatedAt.localeCompare(a.updatedAt));
}

export function addBeliefToStore(
  store: BeliefStore,
  input: { statement: string; facet: BeliefFacet; status: "hypothesis" | "accepted"; confidence: number; evidence: BeliefEvidence },
  deps: MutationDeps = {},
): OperatorBelief {
  const statement = sanitizeBeliefText(input.statement);
  if (!statement) throw new Error("belief statement is required");
  const duplicate = store.beliefs.find((belief) => isLive(belief) && normalized(belief.statement) === normalized(statement));
  if (duplicate) {
    duplicate.evidence.push(input.evidence);
    duplicate.confidence = Math.max(duplicate.confidence, input.confidence);
    if (input.status === "accepted") duplicate.status = "accepted";
    duplicate.updatedAt = nowIso(deps);
    return duplicate;
  }
  const timestamp = nowIso(deps);
  const belief: OperatorBelief = {
    id: (deps.id ?? randomUUID)().slice(0, 12),
    statement,
    facet: input.facet,
    status: input.status,
    confidence: clamp01(input.confidence),
    evidence: [input.evidence],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.beliefs.push(belief);
  return belief;
}

export function supportBeliefInStore(
  store: BeliefStore,
  id: string,
  input: { evidence: BeliefEvidence; confidence: number },
  deps: MutationDeps = {},
): OperatorBelief | null {
  const belief = store.beliefs.find((item) => item.id === id && isLive(item));
  if (!belief) return null;
  belief.evidence.push(input.evidence);
  belief.confidence = Math.max(belief.confidence, clamp01(input.confidence));
  belief.updatedAt = nowIso(deps);
  return belief;
}

export function reviseBeliefInStore(
  store: BeliefStore,
  id: string,
  input: { statement: string; facet?: BeliefFacet; status: "hypothesis" | "accepted"; confidence: number; evidence: BeliefEvidence },
  deps: MutationDeps = {},
): OperatorBelief | null {
  const previous = store.beliefs.find((belief) => belief.id === id && isLive(belief));
  if (!previous) return null;
  const next = addBeliefToStore(store, {
    ...input,
    facet: input.facet ?? previous.facet,
  }, deps);
  if (next.id === previous.id) return previous;
  previous.status = "superseded";
  previous.supersededBy = next.id;
  previous.updatedAt = nowIso(deps);
  next.revisionOf = previous.id;
  return next;
}

export function rejectBeliefInStore(
  store: BeliefStore,
  id: string,
  evidence: BeliefEvidence,
  deps: MutationDeps = {},
): OperatorBelief | null {
  const belief = store.beliefs.find((item) => item.id === id && isLive(item));
  if (!belief) return null;
  belief.status = "rejected";
  belief.evidence.push(evidence);
  belief.updatedAt = nowIso(deps);
  return belief;
}

export function evidence(input: Omit<BeliefEvidence, "timestamp" | "excerpt"> & { excerpt: string }, now = new Date()): BeliefEvidence {
  return BeliefEvidenceSchema.parse({ ...input, excerpt: sanitizeBeliefText(input.excerpt), timestamp: now.toISOString() });
}

export function formatBeliefList(store: BeliefStore): string {
  if (!store.beliefs.length) return "  (no operator beliefs yet)";
  return store.beliefs.map((belief) => {
    const latest = belief.evidence.at(-1);
    const provenance = latest ? `${latest.kind}:${latest.sourceRef}` : "no provenance";
    return `  ${belief.id}  ${belief.status.padEnd(10)} ${belief.facet.padEnd(13)} ${(belief.confidence * 100).toFixed(0).padStart(3)}%  ${belief.statement}\n    evidence ${belief.evidence.length} · ${provenance}`;
  }).join("\n");
}

export function sanitizeBeliefText(input: string): string {
  return sanitizePreferenceContext(input.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim());
}

function isLive(belief: OperatorBelief): boolean {
  return belief.status === "accepted" || belief.status === "hypothesis";
}

function normalized(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function statusRank(status: BeliefStatus): number {
  return status === "accepted" ? 2 : status === "hypothesis" ? 1 : 0;
}

function nowIso(deps: MutationDeps): string {
  return (deps.now ?? new Date()).toISOString();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
