import { statusFor, DEFAULT_WARN_FRACTION } from "./types.js";

// COST-THRESHOLD-UI — the WARNING surface that fires BEFORE the budget hard
// stop (PCLIP-BUDGET-HARDSTOP). When session/loop spend approaches its cap, the
// operator gets a one-time soft "approaching budget (80%)" warning and a one-time
// "budget cap reached" alert — so a hard stop is never a surprise. Pure: the
// threshold level reuses the budget model's statusFor thresholds, and the
// once-per-crossing alert gate is an immutable state transition. No cap (zero /
// non-positive limit) → "none" → no alerts, the current behavior; the same
// crossing never re-alerts because the gate only fires on an ESCALATION past the
// last level it alerted on.

/** Threshold level for a spend/limit pair. Mirrors budget statusFor's bands. */
export type CostAlertLevel = "none" | "warning" | "exceeded";

/** Once-per-crossing alert gate state. `lastAlerted` is the highest level surfaced so far. */
export type CostAlertState = { lastAlerted: CostAlertLevel };

/** The warn fraction the level uses — reuses the budget model's 0.8 default. */
export const COST_WARN_FRACTION = DEFAULT_WARN_FRACTION;

/** A fresh gate that has surfaced nothing yet. Pure. */
export function freshCostAlertState(): CostAlertState {
  return { lastAlerted: "none" };
}

/** Order the levels so escalation is a simple `>` comparison. Internal. */
const LEVEL_RANK: Record<CostAlertLevel, number> = { none: 0, warning: 1, exceeded: 2 };

/**
 * Threshold level for the current spend against the cap. Reuses budget
 * `statusFor` (active→warning at 0.8·limit→exceeded at limit), mapping active→none.
 * No cap (limit ≤ 0, or non-finite spend/limit) → "none". Pure.
 */
export function costAlertLevel(spentUsd: number, limitUsd: number): CostAlertLevel {
  if (!Number.isFinite(spentUsd) || !Number.isFinite(limitUsd) || limitUsd <= 0) return "none";
  const status = statusFor(spentUsd, limitUsd, COST_WARN_FRACTION);
  return status === "active" ? "none" : status;
}

/** Round a USD amount to cents for display. Internal. */
function usd(amount: number): string {
  return amount.toFixed(2);
}

/**
 * The operator-facing alert text for a level. "none" → "" (no surface). Includes
 * the dollar amounts and, for warning, the threshold percent. Pure.
 */
export function formatCostAlert(level: CostAlertLevel, spentUsd: number, limitUsd: number): string {
  const pct = Math.round(COST_WARN_FRACTION * 100);
  if (level === "warning") return `⚠ approaching budget: $${usd(spentUsd)} of $${usd(limitUsd)} (${pct}%)`;
  if (level === "exceeded") return `✖ budget cap reached: $${usd(limitUsd)} — actions may pause`;
  return "";
}

/**
 * Fold the current spend into the gate. Returns the next state plus an `alert`
 * string ONLY when the level ESCALATED past `lastAlerted` (warning fires once,
 * then a later same/lower level → null; a warning→exceeded jump fires the
 * exceeded alert). The same crossing never re-alerts; the state is immutable
 * (a fresh object is returned, the input is untouched). Pure.
 */
export function nextCostAlert(
  state: CostAlertState,
  spentUsd: number,
  limitUsd: number,
): { state: CostAlertState; alert: string | null } {
  const level = costAlertLevel(spentUsd, limitUsd);
  if (LEVEL_RANK[level] <= LEVEL_RANK[state.lastAlerted]) {
    return { state, alert: null };
  }
  return { state: { lastAlerted: level }, alert: formatCostAlert(level, spentUsd, limitUsd) };
}
