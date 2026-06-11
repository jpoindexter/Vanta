import {
  loadEntries,
  saveEntries,
  entryScore,
  isDecayed,
  type BrainEntry,
} from "./entries.js";

// Association — how the brain connects ideas. Memories auto-link to similar
// memories when written, and recall is SPREADING ACTIVATION: a direct hit also
// surfaces its linked neighbors at damped strength, the way recalling one idea
// primes the ones wired to it. Similarity is a zero-dependency token overlap —
// no embeddings, no index, nothing heavy on disk.

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
  "has", "have", "had", "but", "not", "you", "she", "her", "his", "they",
  "them", "its", "about", "into", "over", "when", "what", "which", "their",
]);

const MAX_LINKS = 8; // cap per entry so the graph stays sparse and cheap
const LINK_MIN_SIM = 0.25; // below this, two memories aren't "about" the same thing
const SPREAD_DAMP = 0.5; // neighbor activation = parent score × this
const DIRECT_MIN_REL = 0.18; // weaker query overlap is noise — reachable only via association

/** Content words of a text — lowercase, ≥3 chars, stopwords dropped. Pure. */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

/** Jaccard overlap of two texts' content words (0–1). Pure. */
export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** Entries most similar to a text, above a floor, best first. Pure. */
export function topSimilar(
  text: string,
  entries: BrainEntry[],
  opts: { min?: number; max?: number; excludeId?: string } = {},
): Array<{ entry: BrainEntry; sim: number }> {
  const { min = LINK_MIN_SIM, max = 5, excludeId } = opts;
  return entries
    .filter((e) => e.id !== excludeId)
    .map((entry) => ({ entry, sim: similarity(text, entry.content) }))
    .filter((s) => s.sim >= min)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, max);
}

const addLink = (e: BrainEntry, id: string): void => {
  if (e.id !== id && !e.relatedIds.includes(id) && e.relatedIds.length < MAX_LINKS) e.relatedIds.push(id);
};

/**
 * Wire a just-written memory to its most similar neighbors (both directions,
 * capped) — connection happens at write time, like encoding in context.
 * Best-effort: a failure never breaks the remember that triggered it.
 */
export async function autoLink(entry: BrainEntry, env?: NodeJS.ProcessEnv): Promise<number> {
  try {
    const entries = await loadEntries(env);
    const self = entries.find((e) => e.id === entry.id);
    if (!self) return 0;
    const neighbors = topSimilar(self.content, entries, { excludeId: self.id });
    if (!neighbors.length) return 0;
    for (const { entry: other } of neighbors) {
      addLink(self, other.id);
      addLink(other, self.id);
    }
    await saveEntries(entries, env);
    return neighbors.length;
  } catch {
    return 0;
  }
}

export type Activation = { entry: BrainEntry; activation: number; via: "direct" | "association" };

/** Rank direct matches: score × relevance (similarity, with substring affinity). */
function directHits(query: string | undefined, live: BrainEntry[], now: Date): Activation[] {
  const q = query?.trim();
  return live
    .map((entry) => {
      const rel = !q ? 1 : Math.max(similarity(q, entry.content), entry.content.toLowerCase().includes(q.toLowerCase()) ? 0.6 : 0);
      return { entry, activation: entryScore(entry, now) * rel, via: "direct" as const, rel };
    })
    .filter((h) => h.rel >= (q ? DIRECT_MIN_REL : 1))
    .sort((a, b) => b.activation - a.activation);
}

/**
 * Spreading-activation recall: the strongest direct matches activate, then their
 * linked neighbors light up at damped strength. Returns the merged ranking.
 */
export async function associativeRecall(
  opts: { query?: string; region?: string; topK?: number; env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<Activation[]> {
  const { query, region, topK = 10, env, now = new Date() } = opts;
  const all = (await loadEntries(env)).filter((e) => !isDecayed(e, now));
  const live = region ? all.filter((e) => e.region === region) : all;
  const byId = new Map(all.map((e) => [e.id, e]));

  const direct = directHits(query, live, now).slice(0, topK);
  const seen = new Map<string, Activation>(direct.map((h) => [h.entry.id, h]));
  // One hop of spreading: neighbors of the top hits, damped by the parent's activation.
  for (const hit of direct) {
    for (const id of hit.entry.relatedIds) {
      const neighbor = byId.get(id);
      if (!neighbor || seen.has(id) || isDecayed(neighbor, now)) continue;
      seen.set(id, { entry: neighbor, activation: hit.activation * SPREAD_DAMP, via: "association" });
    }
  }
  return [...seen.values()].sort((a, b) => b.activation - a.activation).slice(0, topK);
}
