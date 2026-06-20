// VANTA-AWAY-SUMMARY — when the operator returns to the terminal after being
// away beyond a threshold (default 5 min), surface a compact "while you were
// away" recap so they can re-orient: elapsed away time + what happened (turns
// completed, files touched, last action / current state). Pure, best-effort,
// non-blocking — same heuristic-bank shape as clarity-gate (zero I/O, zero LLM,
// every clock value injected so the detect + recap build are deterministic).
//
// WIRING (deliberately NOT live this round; terminal focus events are a live
// boundary). The realistic trigger is the NEXT-USER-INPUT point — when the
// operator submits their next message after a gap, mirroring clarity-gate's
// per-instruction call. Both hosts read a last-activity timestamp (the same
// `markProactiveActivity` / proactive `recordActivity` "away" notion stamped
// each completed turn in repl/post-turn-gates.ts) and, before dispatching the
// new turn, call `isAway(lastActiveMs, nowMs)`; when away, build the recap from
// the session breadcrumb (turns + files touched + repl/where.ts lastIntent /
// lastToolCalls as `lastAction`) via `buildAwaySummary` and surface the line.

import { z } from "zod";

// Default away threshold: 5 minutes. The operator is "back from away" only after
// a gap at least this long — a short pause (scrolling, reading) surfaces nothing.
export const DEFAULT_AWAY_MS = 5 * 60_000;

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/** The breadcrumb a recap is built from. All counts are session-scoped. */
export const AwaySummaryInputSchema = z.object({
  /** Elapsed away time in ms (nowMs - lastActiveMs). Negative is clamped to 0. */
  awayMs: z.number(),
  /** Turns the agent completed while the operator was away. */
  turnsWhileAway: z.number().int().min(0).default(0),
  /** Distinct files touched while away (for the "N files touched" count). */
  filesTouched: z.number().int().min(0).default(0),
  /** The last action / current state, e.g. lastIntent or last tool name. */
  lastAction: z.string().default(""),
});
export type AwaySummaryInput = z.infer<typeof AwaySummaryInputSchema>;

/**
 * Resolve the away threshold from the environment. `VANTA_AWAY_SUMMARY_MS`
 * overrides; 0 disables the recap; an invalid / unset / negative value falls
 * back to the 5-minute default. Pure.
 */
export function resolveAwayThresholdMs(env: NodeJS.ProcessEnv): number {
  const value = env.VANTA_AWAY_SUMMARY_MS;
  if (value === undefined || value.trim() === "") return DEFAULT_AWAY_MS;
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_AWAY_MS;
  return raw;
}

/**
 * True when the operator has been away at least the threshold. `nowMs` and
 * `lastActiveMs` are injected (no `Date.now` here) so the detection is
 * deterministic. A threshold of 0 disables the gate (never away). Pure.
 */
export function isAway(lastActiveMs: number, nowMs: number, thresholdMs = DEFAULT_AWAY_MS): boolean {
  if (thresholdMs <= 0) return false;
  return nowMs - lastActiveMs >= thresholdMs;
}

/**
 * Compact, human duration label for an away gap: "45s" / "7m" / "1h 3m" /
 * "2h" (whole-hour gaps drop the trailing "0m"). Sub-minute gaps read in
 * seconds. Negative input clamps to "0s". Pure.
 */
export function awayDurationLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  if (total < ONE_MINUTE_MS) return `${Math.floor(total / 1000)}s`;
  if (total < ONE_HOUR_MS) return `${Math.floor(total / ONE_MINUTE_MS)}m`;
  const hours = Math.floor(total / ONE_HOUR_MS);
  const minutes = Math.floor((total % ONE_HOUR_MS) / ONE_MINUTE_MS);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** "3 turns" / "1 turn" / "" when none. Pure. */
function turnsClause(turns: number): string {
  if (turns <= 0) return "";
  return `${turns} ${turns === 1 ? "turn" : "turns"}`;
}

/** "4 files touched" / "1 file touched" / "" when none. Pure. */
function filesClause(files: number): string {
  if (files <= 0) return "";
  return `${files} ${files === 1 ? "file" : "files"} touched`;
}

/**
 * Build the compact "while you were away" recap, or null when there is nothing
 * to report. Returns null when:
 *  - the input fails validation (errors-as-values, never throws), or
 *  - `awayMs` is below the threshold (not actually away), or
 *  - nothing happened while away (no turns, no files, no last action).
 *
 * When little but non-nothing happened (e.g. away but only a last action, no
 * turns/files) it returns a minimal line — just the elapsed + that action.
 * Pure: every clock value is already folded into `awayMs` by the caller.
 */
export function buildAwaySummary(input: AwaySummaryInput, thresholdMs = DEFAULT_AWAY_MS): string | null {
  const parsed = AwaySummaryInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const { awayMs, turnsWhileAway, filesTouched, lastAction } = parsed.data;

  if (thresholdMs > 0 && awayMs < thresholdMs) return null;

  const action = lastAction.trim();
  const hasActivity = turnsWhileAway > 0 || filesTouched > 0 || action !== "";
  if (!hasActivity) return null;

  const elapsed = awayDurationLabel(awayMs);
  const parts = [turnsClause(turnsWhileAway), filesClause(filesTouched)].filter(Boolean);
  const activity = parts.join(", ");
  const tail = action ? `${activity ? `${activity}, ` : ""}last: ${action}` : activity;

  return `⏱ Back after ${elapsed} — ${tail}`;
}
