import { listSkills } from "../skills/store.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

/** The reload plan: skills appearing/disappearing on disk vs the session's indexed set. */
export type SkillReloadPlan = { added: string[]; removed: string[]; unchanged: string[] };

/** Stable de-dupe preserving first-seen order; drops empty names. */
function uniqueStable(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Compute which skills changed on disk vs the session's indexed set.
 * - on-disk-not-indexed → added (in on-disk order, deduped)
 * - indexed-not-on-disk → removed (in indexed order, deduped)
 * - the intersection → unchanged (in on-disk order, deduped)
 * Pure: no I/O, set-difference only, order stable, idempotent.
 */
export function planSkillReload(
  onDiskNames: readonly string[],
  indexedNames: readonly string[],
): SkillReloadPlan {
  const onDisk = uniqueStable(onDiskNames);
  const indexed = uniqueStable(indexedNames);
  const indexedSet = new Set(indexed);
  const onDiskSet = new Set(onDisk);
  const added = onDisk.filter((name) => !indexedSet.has(name));
  const removed = indexed.filter((name) => !onDiskSet.has(name));
  const unchanged = onDisk.filter((name) => indexedSet.has(name));
  return { added, removed, unchanged };
}

/** Render the reload plan as the user-facing summary line. Pure. */
export function formatSkillReload(plan: SkillReloadPlan): string {
  if (!plan.added.length && !plan.removed.length) {
    return `  no skill changes (${plan.unchanged.length} skills)`;
  }
  const parts = [`  ↻ ${plan.added.length} new skill(s)`];
  if (plan.added.length) parts.push(`: ${plan.added.join(", ")}`);
  return `${parts.join("")} · ${plan.removed.length} removed · ${plan.unchanged.length} unchanged`;
}

/** Reads the on-disk set + the session-indexed set, both injected for testability. */
export type SkillReloadDeps = {
  /** The current-on-disk skill names, re-read fresh so a mid-session skill is seen. */
  readOnDisk: () => Promise<readonly string[]> | readonly string[];
  /** Skill names indexed at session start (the baseline the diff is taken against). */
  readIndexed: () => Promise<readonly string[]> | readonly string[];
  /** The wire to the real re-index for the changed set — the actual re-scan. */
  reindex?: (plan: SkillReloadPlan) => Promise<void> | void;
};

/**
 * /reload-skills — re-read the skill directories, report which skills are newly
 * available (added since session start) vs already-indexed (unchanged) vs removed,
 * and delegate the actual re-index to the injected re-scanner. Nothing changed →
 * "no skill changes".
 */
export async function runReloadSkills(deps: SkillReloadDeps): Promise<SlashResult> {
  const plan = planSkillReload(await deps.readOnDisk(), await deps.readIndexed());
  if ((plan.added.length || plan.removed.length) && deps.reindex) await deps.reindex(plan);
  return { output: formatSkillReload(plan) };
}

/**
 * Per-session baseline of indexed skill names, keyed on the session's RunSetup
 * (one per session). Captured from the first on-disk read so a skill authored
 * after session start surfaces as `added` on the next /reload-skills.
 */
const sessionBaseline = new WeakMap<object, string[]>();

/** Build the live on-disk/indexed readers + re-index wire from the REPL context. */
function liveDeps(ctx: ReplCtx): SkillReloadDeps {
  const key = ctx.setup;
  const readOnDisk = async (): Promise<string[]> =>
    (await listSkills(ctx.env).catch(() => [])).map((s) => s.meta.name);
  return {
    readOnDisk,
    async readIndexed() {
      // First reload of the session seeds the baseline from the current on-disk
      // set; later reloads diff against that frozen baseline so mid-session
      // authoring shows up as `added`.
      const existing = sessionBaseline.get(key);
      if (existing) return existing;
      const seed = await readOnDisk();
      sessionBaseline.set(key, seed);
      return seed;
    },
    reindex(plan) {
      // Re-scan delegated to the skill store's reader on next access; advancing
      // the baseline to the fresh on-disk set so a re-reload reports no churn.
      sessionBaseline.set(key, [...plan.unchanged, ...plan.added]);
    },
  };
}

/** /reload-skills handler — wires the live readers + re-index into the pure plan. */
export const reloadSkills: SlashHandler = (_arg, ctx) => runReloadSkills(liveDeps(ctx));
