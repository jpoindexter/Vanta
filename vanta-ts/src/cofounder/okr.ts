import { z } from "zod";

// COFOUNDER-OKR-METRICS — company OKRs the engine drives work against. An
// objective owns key results, each with a current and a target value; an
// objective MAY be owned by a department (read-only id reference). The model is
// pure/injectable: `objectiveProgress` averages clamped per-KR progress, and
// `furthestFromTarget` is the cadence ranking helper — it picks the KR with the
// largest gap so the cadence loop can prioritise the work furthest from target.
// Store mirrors department.ts: zod at the boundary, tolerant reader, injected fs.

export const KeyResultSchema = z.object({
  name: z.string().min(1),
  current: z.number(),
  target: z.number(),
});
export type KeyResult = z.infer<typeof KeyResultSchema>;

export const ObjectiveSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** Optional owning department id — references department.ts (read-only). */
  departmentId: z.string().min(1).optional(),
  keyResults: z.array(KeyResultSchema).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export type OkrResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Lowercase kebab slug of a title, e.g. "Grow Revenue" → "grow-revenue". Pure. */
export function slugifyObjective(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Derive a stable, unique objective id, appending a counter when taken. Pure. */
export function deriveObjectiveId(existing: Objective[], title: string): string {
  const base = slugifyObjective(title) || "objective";
  const taken = new Set(existing.map((o) => o.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// ---- Pure progress / ranking (the cadence engine reads these) ----

/**
 * Progress of one key result in 0..1 — `current/target` clamped into the band.
 * A non-positive target is treated as already met (1) when current ≥ target,
 * else 0, so a degenerate KR never returns NaN/Infinity. Pure.
 */
export function keyResultProgress(kr: KeyResult): number {
  if (kr.target <= 0) return kr.current >= kr.target ? 1 : 0;
  return clamp01(kr.current / kr.target);
}

/**
 * Objective progress in 0..1 — the average of its KRs' clamped progress. An
 * objective with no key results is 0 (nothing measured yet). Pure.
 */
export function objectiveProgress(obj: Objective): number {
  if (obj.keyResults.length === 0) return 0;
  const sum = obj.keyResults.reduce((acc, kr) => acc + keyResultProgress(kr), 0);
  return sum / obj.keyResults.length;
}

/** The remaining gap of one KR in 0..1 — `1 - progress`. Pure. */
export function keyResultGap(kr: KeyResult): number {
  return 1 - keyResultProgress(kr);
}

export type FurthestFromTarget = {
  objective: Objective;
  keyResult: KeyResult;
  /** Remaining gap 0..1 — larger is further from target. */
  gap: number;
};

/**
 * The cadence ranking helper: across every objective's key results, the single
 * KR with the largest remaining gap (furthest from target) — so the cadence loop
 * can prioritise the department/objective most behind. Ties keep the first seen
 * (stable). Returns null when there are no key results at all. Pure.
 */
export function furthestFromTarget(objectives: Objective[]): FurthestFromTarget | null {
  let best: FurthestFromTarget | null = null;
  for (const objective of objectives) {
    for (const keyResult of objective.keyResults) {
      const gap = keyResultGap(keyResult);
      if (best === null || gap > best.gap) best = { objective, keyResult, gap };
    }
  }
  return best;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// ---- Model mutations (pure) ----

export type AddObjectiveSpec = {
  title: string;
  departmentId?: string;
  keyResults?: KeyResult[];
};

/**
 * Create an objective with optional owning department + key results. Pure — the
 * caller persists the result. Errors-as-values.
 */
export function addObjective(
  existing: Objective[],
  spec: AddObjectiveSpec,
  now: Date = new Date(),
): OkrResult<Objective> {
  const title = spec.title.trim();
  if (!title) return { ok: false, error: "title is required" };

  const keyResults: KeyResult[] = [];
  for (const kr of spec.keyResults ?? []) {
    const parsed = KeyResultSchema.safeParse({ ...kr, name: kr.name.trim() });
    if (!parsed.success) return { ok: false, error: `invalid key result "${kr.name}"` };
    keyResults.push(parsed.data);
  }

  const departmentId = spec.departmentId?.trim();
  const iso = now.toISOString();
  const objective: Objective = {
    id: deriveObjectiveId(existing, title),
    title,
    ...(departmentId ? { departmentId } : {}),
    keyResults,
    createdAt: iso,
    updatedAt: iso,
  };
  return { ok: true, value: objective };
}

/** Find an objective by id in a list. Pure. */
export function getObjective(list: Objective[], id: string): Objective | undefined {
  return list.find((o) => o.id === id);
}

/** All objectives, title-sorted. Pure. */
export function listObjectivesSorted(list: Objective[]): Objective[] {
  return [...list].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Set a named key result's current value on an objective — upserting the KR when
 * `target` is given for a new name. Returns the updated list. Pure. Errors when
 * the objective is unknown, or when a new KR is named without a target.
 */
export function updateKeyResult(
  list: Objective[],
  args: { objectiveId: string; name: string; current: number; target?: number },
  now: Date = new Date(),
): OkrResult<Objective[]> {
  const obj = getObjective(list, args.objectiveId);
  if (!obj) return { ok: false, error: `unknown objective "${args.objectiveId}"` };
  const name = args.name.trim();
  if (!name) return { ok: false, error: "key result name is required" };

  const existing = obj.keyResults.find((kr) => kr.name === name);
  if (!existing && args.target === undefined) {
    return { ok: false, error: `new key result "${name}" needs a target` };
  }
  const target = existing ? (args.target ?? existing.target) : (args.target as number);
  const nextKr: KeyResult = { name, current: args.current, target };
  const keyResults = existing
    ? obj.keyResults.map((kr) => (kr.name === name ? nextKr : kr))
    : [...obj.keyResults, nextKr];

  const patched = list.map((o) =>
    o.id === args.objectiveId ? { ...o, keyResults, updatedAt: now.toISOString() } : o,
  );
  return { ok: true, value: patched };
}

// ---- Store (~/.vanta/okrs.json) — extracted to okr-store.ts for the size gate;
// re-exported here so callers keep the same `./okr.js` module path. ----

export {
  okrsPath,
  readObjectives,
  writeObjectives,
  type OkrStoreFs,
} from "./okr-store.js";
