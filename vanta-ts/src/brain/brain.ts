import { brainDigest as regionsDigest, readRegion, writeRegion, ensureBrain } from "./store.js";
import {
  topEntries,
  upsertEntry,
  reinforceEntries,
  sweepDecayed,
  loadEntries,
  isDecayed,
  formatEntry,
  type BrainEntry,
  type UpsertOpts,
} from "./entries.js";
import { BRAIN_REGIONS } from "./regions.js";

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

const DIGEST_ENTRIES = 8;

/** Store a structured memory (re-asserting the same content strengthens it). */
export async function remember(opts: UpsertOpts): Promise<BrainEntry> {
  return upsertEntry(opts);
}

export type RecallResult = { entries: BrainEntry[]; formatted: string };

/**
 * Retrieve the strongest matching memories — and let retrieval reinforce them
 * (use is what crystallizes a memory). Pass reinforce:false for a passive peek.
 */
export async function recall(
  opts: { query?: string; region?: string; topK?: number; reinforce?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<RecallResult> {
  const { reinforce = true, topK = 10, ...rest } = opts;
  const entries = await topEntries({ ...rest, topK });
  if (reinforce && entries.length) {
    await reinforceEntries(entries.map((e) => e.id), opts.env).catch(() => {});
  }
  return { entries, formatted: entries.map(formatEntry).join("\n") };
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
  return { ok: missing.length === 0, regionsPresent: present, regionsMissing: missing, entryCount, decayedCount };
}
