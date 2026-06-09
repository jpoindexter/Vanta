// O10b — autonomy L5 (auto-merge low-risk). The 5th ladder rung lands a pushed
// factory branch into a dedicated integration branch WITHOUT a human.
//
// Safety note: the factory's git lifecycle (branch/commit/push/merge) runs git
// directly, NOT through the kernel `assess()` gate. A merge adds no new content
// (the slice was already vetted by the verifier) — so the entire safety story at
// merge time is THIS classifier. It is therefore pure, exhaustively tested, and
// fails closed. Three independent gates must all pass to merge:
//   1. armed       — VANTA_AUTONOMY_ALLOW_MERGE explicitly set (default OFF)
//   2. safe target — never the default branch (main/master); never force
//   3. low-risk    — limbs/reflexes/memory only, no dep/env/config/migration
//                    change, diff under a bound
// Anything short of all three stops at L4 (pushed, awaiting human merge).

import { autonomyCapForFiles } from "./compartments.js";

/** Max changed lines (added + deleted) a slice may have and still auto-merge. */
export const MAX_MERGE_DIFF_LINES = 400;
/** Max changed files a slice may have and still auto-merge. */
export const MAX_MERGE_FILES = 20;

/** Files whose change makes a slice too risky to land without review. */
const SENSITIVE = [
  /(^|\/)package(-lock)?\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)yarn\.lock$/i,
  /\.lock$/i,
  /(^|\/)\.env($|\.)/i,
  /(^|\/)cargo\.(toml|lock)$/i,
  /(^|\/)(migrations|seeds)\//i,
  /\.config\.(ts|js|mjs|cjs)$/i,
  /(^|\/)tsconfig.*\.json$/i,
];

export type MergeRiskInputs = {
  /** Files the slice touched (relative to root). */
  touchedFiles: string[];
  /** Changed lines (added + deleted) in the slice. */
  diffLineCount: number;
  /** True when VANTA_AUTONOMY_ALLOW_MERGE is set. */
  allowMerge: boolean;
  /** The branch the slice would merge into. */
  mergeTarget: string;
};

export type MergeDecision = { merge: boolean; reason: string };

/** Resolve where an L5 slice lands. Never the default branch by default. */
export function resolveMergeTarget(env: NodeJS.ProcessEnv): string {
  return env.VANTA_FACTORY_MERGE_TARGET?.trim() || "factory/integration";
}

/** Branches the factory must never auto-merge into. */
export function isDefaultBranch(b: string): boolean {
  return b === "main" || b === "master";
}

/** The L5 low-risk gate. Fails closed — any failing check blocks the merge. */
export function assessMergeRisk(inputs: MergeRiskInputs): MergeDecision {
  if (!inputs.allowMerge) {
    return { merge: false, reason: "L5 merge not armed — set VANTA_AUTONOMY_ALLOW_MERGE to enable" };
  }
  if (isDefaultBranch(inputs.mergeTarget)) {
    return { merge: false, reason: `refusing to auto-merge into the default branch '${inputs.mergeTarget}'` };
  }
  const cap = autonomyCapForFiles(inputs.touchedFiles);
  if (cap.maxLevel < 5) {
    return { merge: false, reason: `${cap.compartment} compartment caps autonomy at L${cap.maxLevel} — not mergeable` };
  }
  const sensitive = inputs.touchedFiles.find((f) => SENSITIVE.some((re) => re.test(f)));
  if (sensitive) {
    return { merge: false, reason: `dep/env/config/migration change (${sensitive}) — needs review` };
  }
  if (inputs.touchedFiles.length > MAX_MERGE_FILES) {
    return { merge: false, reason: `slice too large — ${inputs.touchedFiles.length} files > ${MAX_MERGE_FILES}` };
  }
  if (inputs.diffLineCount > MAX_MERGE_DIFF_LINES) {
    return { merge: false, reason: `diff too large — ${inputs.diffLineCount} lines > ${MAX_MERGE_DIFF_LINES}` };
  }
  return { merge: true, reason: "low-risk: armed, safe target, limbs-only, small diff, no dep/env change" };
}
