// VANTA-IDLE-RETURN — after a LONG idle gap, the next interaction surfaces a
// brief re-engagement prompt offering concrete ways to continue, so a returning
// operator isn't dropped cold. This is the NEXT-ACTIONS complement to
// VANTA-AWAY-SUMMARY (away-summary.ts RECAPS what happened; idle-return OFFERS
// what to do next). Pure, best-effort, non-blocking — same heuristic-bank shape
// as clarity-gate / away-summary (zero I/O, zero LLM, every clock value injected
// so the detect + build are deterministic). Under the threshold = nothing.
//
// Idle-return reuses away-summary's `isAway` (the same nowMs/lastActiveMs gap
// notion) but at a LONGER threshold: away-summary fires at a 5-min pause to recap
// background work; idle-return fires at a 30-min gap — the operator has actually
// stepped away and is now returning — to offer next-actions rather than re-run
// silently. `isIdleReturn` IS `isAway` parameterized with the idle threshold.
//
// WIRING (deliberately NOT live this round; focus-regain is a live boundary).
// The realistic trigger is the SAME next-user-input point that hosts away-summary
// — repl/post-turn-gates.ts stamps last-activity each completed turn (the
// `markProactiveActivity` / proactive `recordActivity` "away" timestamp), and the
// next-submit path (interactive.ts `runUserTurn` / ui/use-agent.ts `sendToAgent`,
// alongside the clarity-gate / away-summary calls) would, before dispatching the
// new turn, call `isIdleReturn(lastActiveMs, nowMs)`; when idle, build the block
// from the active goal (kernel goals, first active) + in-progress items
// (repl/closure-gate.ts `getInProgressItems` — unclosed writes) via
// `buildIdleReturn` and surface the line. Gate on `idleReturnEnabled(env)` first.

import { z } from "zod";
import { isAway } from "./away-summary.js";

// Default idle-return threshold: 30 minutes. A bigger gap than away-summary's
// 5-min pause — the operator has stepped away and is returning, not just paused.
export const DEFAULT_IDLE_RETURN_MS = 30 * 60_000;

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

// Control chars (incl. ESC \x1b / BEL \x07 / newlines) — stripped from the goal /
// item text so a stored value can never inject an escape sequence into the block
// (no escape injection). Mirrors ui/status-notices.ts sanitizeText.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const WHITESPACE_RUN = /\s+/g;

/** Strip control chars, collapse whitespace runs to single spaces, trim. Pure. */
function sanitizeText(text: string): string {
  return text.replace(CONTROL_CHARS, " ").replace(WHITESPACE_RUN, " ").trim();
}

/** The breadcrumb a re-engagement block is built from. */
export const IdleReturnInputSchema = z.object({
  /** Elapsed idle time in ms (nowMs - lastActiveMs). Negative is clamped to 0. */
  idleMs: z.number(),
  /** The active goal text to offer resuming, if any. */
  activeGoal: z.string().optional(),
  /** Count of in-progress items (e.g. unclosed writes) to offer reviewing. */
  inProgressItems: z.number().int().min(0).optional(),
});
export type IdleReturnInput = z.infer<typeof IdleReturnInputSchema>;

/**
 * Resolve the idle-return threshold from the environment. `VANTA_IDLE_RETURN_MS`
 * overrides; 0 disables (never idle); an invalid / unset / negative value falls
 * back to the 30-minute default. Pure.
 */
export function resolveIdleThresholdMs(env: NodeJS.ProcessEnv): number {
  const value = env.VANTA_IDLE_RETURN_MS;
  if (value === undefined || value.trim() === "") return DEFAULT_IDLE_RETURN_MS;
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_IDLE_RETURN_MS;
  return raw;
}

/**
 * True when the operator has been idle at least the threshold. `nowMs` and
 * `lastActiveMs` are injected (no `Date.now` here) so the detection is
 * deterministic. A threshold of 0 disables the gate (never idle). Reuses
 * away-summary's `isAway` (same gap notion) at the longer idle threshold. Pure.
 */
export function isIdleReturn(
  lastActiveMs: number,
  nowMs: number,
  thresholdMs = DEFAULT_IDLE_RETURN_MS,
): boolean {
  return isAway(lastActiveMs, nowMs, thresholdMs);
}

/**
 * Whether the re-engagement prompt is enabled. On by default; `VANTA_IDLE_RETURN=0`
 * disables it entirely (a returning operator is dropped cold by choice). Pure.
 */
export function idleReturnEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_IDLE_RETURN !== "0";
}

/**
 * Compact, human duration label for an idle gap: "31m" / "1h 3m" / "2h"
 * (whole-hour gaps drop the trailing "0m"). Idle gaps are minutes-or-more by
 * definition, so the sub-minute branch is only a clamp guard. Pure.
 */
export function idleDurationLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  if (total < ONE_MINUTE_MS) return `${Math.floor(total / 1000)}s`;
  if (total < ONE_HOUR_MS) return `${Math.floor(total / ONE_MINUTE_MS)}m`;
  const hours = Math.floor(total / ONE_HOUR_MS);
  const minutes = Math.floor((total % ONE_HOUR_MS) / ONE_MINUTE_MS);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** "1 in-progress item" / "3 in-progress items". Assumes count > 0. Pure. */
function itemsLabel(count: number): string {
  return `${count} in-progress ${count === 1 ? "item" : "items"}`;
}

/**
 * Build the compact re-engagement block, or null when there is nothing to offer.
 * Returns null when:
 *  - the input fails validation (errors-as-values, never throws), or
 *  - `idleMs` is below the threshold (not actually a long idle gap).
 *
 * When idle, it offers numbered next-actions — only the ones that apply:
 *   1) Resume: <goal>          (only when activeGoal is non-empty)
 *   2) Review N in-progress…   (only when inProgressItems > 0)
 *   3) Start fresh             (ALWAYS offered when idle — the floor)
 *
 * DOCUMENTED CHOICE: "start fresh" is offered whenever idle, even with no goal
 * and no in-progress items. A returning operator with no carried state should
 * still be acknowledged with a way forward rather than dropped cold (that is the
 * card's whole point), so an idle gap is never null-for-nothing. The options are
 * re-numbered 1..N so they always read 1) / 2) / 3) regardless of which apply.
 * Pure: every clock value is already folded into `idleMs` by the caller.
 */
export function buildIdleReturn(
  input: IdleReturnInput,
  thresholdMs = DEFAULT_IDLE_RETURN_MS,
): string | null {
  const parsed = IdleReturnInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const { idleMs, activeGoal, inProgressItems } = parsed.data;

  if (!isIdleReturn(0, idleMs, thresholdMs)) return null;

  const goal = sanitizeText(activeGoal ?? "");
  const items = inProgressItems ?? 0;

  const choices: string[] = [];
  if (goal) choices.push(`Resume: ${goal}`);
  if (items > 0) choices.push(`Review ${itemsLabel(items)}`);
  choices.push("Start fresh");

  const numbered = choices.map((c, i) => `${i + 1}) ${c}`).join("  ");
  return `↩ Back after ${idleDurationLabel(idleMs)} — ${numbered}`;
}
