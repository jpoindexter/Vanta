import type { WorkItem } from "./types.js";

export const DEFAULT_AMBIGUITY_THRESHOLD = 0.5;

/**
 * Score a work item's ambiguity from 0 (clear) to 1 (too vague to execute).
 * Pure — no I/O. Used by the factory pre-execution gate.
 */
export function scoreAmbiguity(item: WorkItem): number {
  const desc = item.description.trim();
  if (desc.length < 15) return 0.9; // suspiciously short
  if (/\.\.\.|TODO|TBD|unclear|unspecified|something|whatever/i.test(desc)) return 0.8;
  if (desc.split(/\s+/).length < 4) return 0.75; // fewer than 4 words
  return 0.1; // probably concrete enough
}

/**
 * Returns true when the item is too vague to run — skip it and surface the gap
 * rather than executing and producing a bad slice.
 * Threshold is configurable via ARGO_PREFLIGHT_THRESHOLD (0–1, default 0.5).
 */
export function shouldClarify(item: WorkItem, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = parseFloat(env.ARGO_PREFLIGHT_THRESHOLD ?? "");
  const threshold = isNaN(raw) ? DEFAULT_AMBIGUITY_THRESHOLD : Math.max(0, Math.min(1, raw));
  if (threshold === 0) return false;
  return scoreAmbiguity(item) >= threshold;
}

export function buildPrefightNote(item: WorkItem): string {
  const score = scoreAmbiguity(item);
  return (
    `factory: [preflight] item "${item.description.slice(0, 60)}" is too vague (ambiguity=${score.toFixed(2)}).\n` +
    `Add more context to ROADMAP.md or PARKED.md before running this cycle.`
  );
}
