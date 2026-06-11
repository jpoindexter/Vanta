import {
  loadEntries,
  saveEntries,
  entryScore,
  isDecayed,
  crystalFor,
  type BrainEntry,
} from "./entries.js";
import { similarity } from "./assoc.js";

// Consolidation — what sleep does for a brain. Near-duplicate memories merge
// into one stronger gist (links and reinforcement carried over), decayed ones
// fall away, and a hard entry budget keeps the whole store bounded on disk no
// matter how long Vanta runs — the weakest memories are the ones that go.

const DEFAULT_MAX_ENTRIES = 400;
const DUP_SIM = 0.82; // this similar in the same region = the same memory
const MAX_LINKS = 8;

/** Entry budget: VANTA_BRAIN_MAX_ENTRIES (min 50), default 400. */
export function resolveMaxEntries(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VANTA_BRAIN_MAX_ENTRIES);
  return Number.isFinite(raw) && raw >= 50 ? Math.floor(raw) : DEFAULT_MAX_ENTRIES;
}

/** Fold the absorbed memory into the survivor: a stronger, better-connected gist. */
function absorb(survivor: BrainEntry, dup: BrainEntry, now: Date): void {
  survivor.strength = Math.min(1, Math.max(survivor.strength, dup.strength) + 0.05);
  survivor.retrievalCount += dup.retrievalCount;
  survivor.crystalStatus = crystalFor(survivor.retrievalCount);
  survivor.sourceType = "crystallized"; // a merged memory is a consolidated gist
  for (const id of [...dup.relatedIds, ...dup.contradicts]) {
    const into = dup.contradicts.includes(id) ? survivor.contradicts : survivor.relatedIds;
    if (id !== survivor.id && !into.includes(id) && into.length < MAX_LINKS) into.push(id);
  }
  if (dup.createdAt < survivor.createdAt) survivor.createdAt = dup.createdAt;
  survivor.updatedAt = now.toISOString();
}

type MergeResult = { entries: BrainEntry[]; merged: number; remap: Map<string, string> };

/** Merge near-duplicates within each region (strongest survives). Pure on its copy. */
export function mergeDuplicates(entries: BrainEntry[], now = new Date()): MergeResult {
  const sorted = [...entries].sort((a, b) => entryScore(b, now) - entryScore(a, now));
  const absorbed = new Set<string>();
  const remap = new Map<string, string>();
  for (let i = 0; i < sorted.length; i++) {
    const survivor = sorted[i]!;
    if (absorbed.has(survivor.id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const dup = sorted[j]!;
      if (absorbed.has(dup.id) || dup.region !== survivor.region) continue;
      if (similarity(survivor.content, dup.content) < DUP_SIM) continue;
      absorb(survivor, dup, now);
      absorbed.add(dup.id);
      remap.set(dup.id, survivor.id);
    }
  }
  return { entries: sorted.filter((e) => !absorbed.has(e.id)), merged: absorbed.size, remap };
}

/** Re-point links at merge survivors and drop links to memories that no longer exist. */
function relink(entries: BrainEntry[], remap: Map<string, string>): void {
  const alive = new Set(entries.map((e) => e.id));
  for (const e of entries) {
    e.relatedIds = [...new Set(e.relatedIds.map((id) => remap.get(id) ?? id))]
      .filter((id) => id !== e.id && alive.has(id))
      .slice(0, MAX_LINKS);
    e.contradicts = e.contradicts.map((id) => remap.get(id) ?? id).filter((id) => alive.has(id));
  }
}

export type ConsolidateReport = { kept: number; merged: number; sweptDecayed: number; droppedWeak: number };

/**
 * One consolidation pass: merge near-duplicates → sweep decayed → enforce the
 * entry budget (weakest dropped) → heal all links. Saves only when something
 * changed. The whole store stays small and the strong memories stay.
 */
export async function consolidate(
  opts: { env?: NodeJS.ProcessEnv; maxEntries?: number; now?: Date } = {},
): Promise<ConsolidateReport> {
  const { env, now = new Date() } = opts;
  const max = opts.maxEntries ?? resolveMaxEntries(env);
  const before = await loadEntries(env);

  const { entries: mergedEntries, merged, remap } = mergeDuplicates(before, now);
  const live = mergedEntries.filter((e) => !isDecayed(e, now));
  const sweptDecayed = mergedEntries.length - live.length;
  const kept = live.sort((a, b) => entryScore(b, now) - entryScore(a, now)).slice(0, max);
  const droppedWeak = live.length - kept.length;
  relink(kept, remap);

  if (merged || sweptDecayed || droppedWeak) await saveEntries(kept, env);
  return { kept: kept.length, merged, sweptDecayed, droppedWeak };
}

/** Run consolidation only when the store is over budget. Best-effort. */
export async function maybeConsolidate(env: NodeJS.ProcessEnv = process.env): Promise<ConsolidateReport | null> {
  try {
    const count = (await loadEntries(env)).length;
    if (count <= resolveMaxEntries(env)) return null;
    return await consolidate({ env });
  } catch {
    return null;
  }
}
