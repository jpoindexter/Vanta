import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SafetyClient } from "../safety-client.js";

// GOAL-CONDITION: parse + check "done when `<cmd>`" conditions on active goals.
// After each turn the host calls checkGoalLoop; if the condition is not met it
// returns a continuation prompt so the host can auto-send the next turn without
// user input, up to VANTA_GOAL_LOOP_MAX iterations.

const execFileP = promisify(execFile);

/** Extract a shell command from "done when `<cmd>`" goal text. Returns null if absent. */
export function parseDoneCondition(goalText: string): string | null {
  const m = goalText.match(/done when\s+`([^`]+)`/i);
  return m ? m[1]!.trim() : null;
}

export const DEFAULT_GOAL_LOOP_MAX = 10;

export function buildGoalLoopMax(env: NodeJS.ProcessEnv): number {
  const raw = parseInt(env.VANTA_GOAL_LOOP_MAX ?? "", 10);
  return isNaN(raw) || raw <= 0 ? DEFAULT_GOAL_LOOP_MAX : raw;
}

/** Run a shell command in `cwd`; return true only when exit code is 0. */
export async function checkCondition(cmd: string, cwd: string): Promise<boolean> {
  try {
    await execFileP("sh", ["-c", cmd], { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check the active goal's done-condition after a turn.
 *
 * Returns null when: no active goal, no "done when" condition, or condition
 * passed (goal auto-completed). Returns a continuation prompt string when the
 * condition is not yet met — the host should send that as the next agent turn.
 * Best-effort: any failure returns null so the session is never broken.
 */
export async function checkGoalLoop(opts: {
  safety: SafetyClient;
  cwd: string;
  onNote: (text: string) => void;
}): Promise<string | null> {
  try {
    const goals = await opts.safety.getGoals().catch(() => []);
    const active = goals.find((g) => g.status === "active");
    if (!active) return null;
    const cmd = parseDoneCondition(active.text);
    if (!cmd) return null;
    const passed = await checkCondition(cmd, opts.cwd);
    if (passed) {
      await opts.safety.completeGoal(active.id).catch(() => {});
      opts.onNote("  ✓ goal condition passed — marked complete");
      return null;
    }
    return `Condition not yet passing. Continue working toward: ${active.text}`;
  } catch {
    return null;
  }
}
