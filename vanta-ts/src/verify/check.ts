import type { Lock } from "./store.js";

export type CheckResult = {
  id: string;
  claim: string;
  status: "passing" | "regressed";
  detail: string;
};

/** Pure verdict: did the command output still contain the locked substring? */
export function evaluateOutput(expect: string, output: string): boolean {
  return output.includes(expect);
}

/**
 * Pure: fold a command's run into a CheckResult against its lock. A non-zero
 * exit OR a missing substring is a regression — both mean the proven behavior
 * no longer holds.
 */
export function gradeRun(
  lock: Lock,
  run: { exitCode: number; output: string },
): CheckResult {
  const passed = run.exitCode === 0 && evaluateOutput(lock.expect, run.output);
  const detail = passed
    ? `ok — output contains "${lock.expect}"`
    : run.exitCode !== 0
      ? `command exited ${run.exitCode}`
      : `output no longer contains "${lock.expect}"`;
  return { id: lock.id, claim: lock.claim, status: passed ? "passing" : "regressed", detail };
}

const GLYPH = { locked: "·", passing: "✓", regressed: "✘" } as const;

/** One-line render of a lock's current state. */
export function formatLock(lock: Pick<Lock, "id" | "claim" | "status" | "detail">): string {
  const g = GLYPH[lock.status];
  const tail = lock.detail ? ` — ${lock.detail}` : "";
  return `  ${g} ${lock.id}  ${lock.claim}${tail}`;
}

/** Summary report for a check run. */
export function formatCheckReport(results: CheckResult[]): string {
  if (results.length === 0) return "No regression locks to check.";
  const regressed = results.filter((r) => r.status === "regressed");
  const lines = results.map((r) => formatLock(r));
  const head =
    regressed.length === 0
      ? `All ${results.length} lock(s) passing.`
      : `⚠ ${regressed.length}/${results.length} lock(s) REGRESSED.`;
  return [head, ...lines].join("\n");
}
