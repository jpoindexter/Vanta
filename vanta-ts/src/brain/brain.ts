import { brainDigest as regionsDigest, readRegion, writeRegion, ensureBrain } from "./store.js";
import {
  topEntries,
  upsertEntry,
  reinforceEntries,
  sweepDecayed,
  loadEntries,
  saveEntries,
  isDecayed,
  formatEntry,
  type BrainEntry,
  type UpsertOpts,
} from "./entries.js";
import { autoLink, associativeRecall, type Activation } from "./assoc.js";
import { maybeConsolidate, consolidate, resolveMaxEntries } from "./consolidate.js";
import { BRAIN_REGIONS } from "./regions.js";
import { resolveVaultPath, writeVaultPage, isPromotable } from "./vault-bridge.js";

export { consolidate };

// THE brain — one cohesive unit. Everything outside brain/ imports from here.
// It composes two layers behind one surface:
//   · regions  — human-readable markdown (~/.vanta/brain/<region>.md): the
//     auditable seed of identity/memory; read/written via readRegion/writeRegion.
//   · entries  — structured memories (entries.json): typed, strength-scored,
//     decay-aware, reinforced by retrieval (entries.ts).
// Every composite operation is best-effort per layer: a corrupt store or missing
// region degrades that layer to empty instead of breaking the brain — Vanta can
// repair or grow one part while the rest keeps working.

export { readRegion, writeRegion, ensureBrain };
export type { BrainEntry };

// Best-of exemplar library — won tournament/loop results become few-shot context
// for later similar tasks. Composed onto the facade so everything outside brain/
// reaches exemplars through the same surface as remember/recall.
export { storeExemplar, recallExemplars, exemplarContext, formatExemplars } from "./exemplars.js";
export type { StoreExemplarResult, RecalledExemplar } from "./exemplars.js";

const DIGEST_ENTRIES = 8;

/**
 * Store a structured memory (re-asserting the same content strengthens it),
 * then wire it to its most similar neighbors — ideas connect at write time.
 */
export async function remember(opts: UpsertOpts): Promise<BrainEntry> {
  const entry = await upsertEntry(opts);
  await autoLink(entry, opts.env); // best-effort inside
  return entry;
}

export type RecallResult = { entries: BrainEntry[]; formatted: string; activations: Activation[] };

/**
 * Spreading-activation retrieval: the strongest matches surface, and their
 * linked neighbors light up with them (recalling one idea primes the ones wired
 * to it). Direct hits are reinforced — use is what crystallizes a memory;
 * association-surfaced neighbors are primed, not retrieved, so they are not.
 * Pass reinforce:false for a fully passive peek.
 */
export async function recall(
  opts: { query?: string; region?: string; topK?: number; reinforce?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<RecallResult> {
  const { reinforce = true, topK = 10, ...rest } = opts;
  const activations = await associativeRecall({ ...rest, topK });
  const directIds = activations.filter((a) => a.via === "direct").map((a) => a.entry.id);
  if (reinforce && directIds.length) {
    await reinforceEntries(directIds, opts.env).catch(() => {});
    await promoteCrystallized(opts.env).catch(() => {}); // graduate proven knowledge → vault
  }
  const entries = activations.map((a) => a.entry);
  const formatted = activations
    .map((a) => (a.via === "association" ? `↪ ${formatEntry(a.entry)}` : formatEntry(a.entry)))
    .join("\n");
  return { entries, formatted, activations };
}

/**
 * Graduate crystallized semantic knowledge to the Obsidian vault as wiki pages
 * (the brain↔vault bridge). Deterministic: any entry that proves durable enough
 * to crystallize is written once and stamped `sourceRef: vault:<path>` so it
 * never duplicates. No-op when no vault is configured. Best-effort per entry.
 */
export async function promoteCrystallized(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const vault = await resolveVaultPath(env);
  if (!vault) return 0;
  const entries = await loadEntries(env);
  const date = new Date().toISOString().slice(0, 10);
  let promoted = 0;
  for (const e of entries) {
    if (!isPromotable(e)) continue;
    const rel = await writeVaultPage(vault, e, date);
    if (rel) { e.sourceRef = `vault:${rel}`; promoted++; }
  }
  if (promoted) await saveEntries(entries, env);
  return promoted;
}

/** Drop decayed entries (lazy hygiene — digest calls this best-effort). */
export async function sweep(env?: NodeJS.ProcessEnv): Promise<number> {
  return sweepDecayed(env);
}

/**
 * The brain's single prompt digest: the capped markdown-region digest plus the
 * top structured memories. Each layer is independently best-effort — with no
 * entries (or a broken entry store) the output is exactly the region digest.
 */
export async function brainDigest(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const parts: string[] = [];
  try {
    const regions = await regionsDigest(env);
    if (regions.trim()) parts.push(regions);
  } catch { /* regions unreadable — entries may still serve */ }
  try {
    await sweep(env).catch(() => {});
    await maybeConsolidate(env); // over-budget? merge dupes + drop weakest (sleep-style)
    const top = await topEntries({ topK: DIGEST_ENTRIES, env });
    if (top.length) {
      parts.push(`### Structured recall (top ${top.length} by strength×recency)\n${top.map(formatEntry).join("\n")}`);
    }
  } catch { /* entry store unreadable — regions already cover */ }
  return parts.join("\n\n");
}

export type BrainHealth = {
  ok: boolean;
  regionsPresent: number;
  regionsMissing: string[];
  entryCount: number;
  decayedCount: number;
  /** The entry budget — consolidation keeps entryCount at or under this. */
  maxEntries: number;
};

/** Self-check both layers — what Vanta reads before repairing itself. */
export async function brainHealth(env: NodeJS.ProcessEnv = process.env): Promise<BrainHealth> {
  const missing: string[] = [];
  let present = 0;
  for (const r of BRAIN_REGIONS) {
    try {
      if ((await readRegion(r.name, env)) !== null) present++;
      else missing.push(r.name);
    } catch {
      missing.push(r.name);
    }
  }
  let entryCount = 0;
  let decayedCount = 0;
  try {
    const entries = await loadEntries(env);
    entryCount = entries.length;
    decayedCount = entries.filter((e) => isDecayed(e)).length;
  } catch { /* counted as zero */ }
  return { ok: missing.length === 0, regionsPresent: present, regionsMissing: missing, entryCount, decayedCount, maxEntries: resolveMaxEntries(env) };
}
