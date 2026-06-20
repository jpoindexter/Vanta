// VANTA-SHUTDOWN-MSG — a compact graceful goodbye printed when an interactive
// session ends (Ctrl-D / `/exit`), instead of an abrupt cut. PURE: the summary
// is built from two iso timestamps + a turn count + the optional session-cost
// split — NO `new Date()` here, so the same inputs always yield the same line
// (the duration comes only from the two passed iso/ms values). A zero-activity
// session gets a minimal one-liner; a worked session gets duration + turns + cost.
//
// WIRING (named, not done this round): the live print site is interactive.ts's
// `runChat` `finally` block — replace the bare `console.log("\nbye.")` (the
// abrupt cut after the `finally`) with `console.log(buildShutdownMessage({
//   startedIso: state.started, nowIso: new Date().toISOString(),
//   turnCount: state.turnIndex, sessionCost: state.sessionCost }))`. The impure
// `now` (new Date) is supplied by the host; this module stays pure + testable.

import { formatUsd, type SessionCost } from "../pricing.js";

const SIGN_OFF = "see you next time";
const MARKER = "✶";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** Inputs for the goodbye line. `nowIso` is the host's exit timestamp (impure at the call site, pure here). */
export type ShutdownSummary = {
  startedIso: string;
  nowIso: string;
  turnCount: number;
  sessionCost?: SessionCost;
};

/** Elapsed ms between two iso/ms timestamps, clamped at 0. Unparsable → 0. Pure. */
function elapsedMs(startedIso: string, nowIso: string): number {
  const start = Date.parse(startedIso);
  const now = Date.parse(nowIso);
  if (isNaN(start) || isNaN(now)) return 0;
  return Math.max(0, now - start);
}

/**
 * A compact human duration from two iso (or ms-string) timestamps: sub-minute →
 * `45s`, sub-hour → `7m`, else `1h 3m` (trailing `0m` dropped → `2h`). Derived
 * ONLY from the two passed values — no `new Date()`. Pure, deterministic.
 */
export function sessionDurationLabel(startedIso: string, nowIso: string): string {
  const ms = elapsedMs(startedIso, nowIso);
  if (ms < MS_PER_MINUTE) return `${Math.floor(ms / MS_PER_SECOND)}s`;
  if (ms < MS_PER_HOUR) return `${Math.floor(ms / MS_PER_MINUTE)}m`;
  const hours = Math.floor(ms / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** The session-cost fragment, only when a metered frontier spend is present + non-zero. Pure. */
function costFragment(cost?: SessionCost): string | null {
  const usd = cost?.frontierUsd ?? 0;
  return usd > 0 ? formatUsd(usd) : null;
}

/**
 * The compact goodbye line. A worked session →
 * `✶ Session ended · 12 turns · 7m · $0.03 — see you next time` (cost only when
 * present/non-zero). A zero-turn session → a minimal `✶ Session ended` with no
 * noisy summary. Pure: duration comes from the two iso values, never the clock.
 */
export function buildShutdownMessage(summary: ShutdownSummary): string {
  const { startedIso, nowIso, turnCount, sessionCost } = summary;
  if (turnCount <= 0) return `${MARKER} Session ended`;

  const turns = `${turnCount} turn${turnCount === 1 ? "" : "s"}`;
  const parts = [turns, sessionDurationLabel(startedIso, nowIso)];
  const cost = costFragment(sessionCost);
  if (cost) parts.push(cost);

  return `${MARKER} Session ended · ${parts.join(" · ")} — ${SIGN_OFF}`;
}
