import { statusFor, remainingUsd, type Budget } from "./types.js";

// VANTA-COST-GUARD — the pre-turn decision for a run/session cost ceiling. Vanta
// already TRACKS spend + enforces loop-scope hard stops; this adds the turn-
// boundary gate so an autonomous run WARNS as it nears the limit and HALTS (or
// ASKS) BEFORE the next turn would cross it — no silent overspend. Pure.

export type GuardMode = "halt" | "ask";
export type GuardAction = "allow" | "warn" | "halt" | "ask";
export type GuardDecision = { action: GuardAction; message?: string };

const usd = (n: number): string => `$${n.toFixed(2)}`;

/**
 * Decide what to do BEFORE the next turn, given the scope's budget (or null = no
 * ceiling set) and the estimated cost of that turn:
 *   - no budget → allow.
 *   - already exceeded, OR spent + estimate would cross the limit → halt/ask
 *     (per `mode`) — stop before overspending.
 *   - at/over the warn fraction (but the next turn still fits) → warn + proceed.
 *   - otherwise → allow.
 * `estimatedNextUsd` may be 0 (unknown) — then only the current spend gates. Pure.
 */
export function guardBeforeTurn(budget: Budget | null, estimatedNextUsd: number, mode: GuardMode = "halt"): GuardDecision {
  if (!budget) return { action: "allow" };
  const projected = budget.spentUsd + Math.max(0, estimatedNextUsd);
  const wouldCross = statusFor(projected, budget.limitUsd, budget.warnFraction) === "exceeded";
  if (budget.status === "exceeded" || wouldCross) {
    const why = `Cost guard: ${usd(budget.spentUsd)} spent of the ${usd(budget.limitUsd)} ceiling` +
      (estimatedNextUsd > 0 ? ` (next turn ~${usd(estimatedNextUsd)} would exceed it)` : "") + ".";
    return mode === "ask"
      ? { action: "ask", message: `${why} Continue anyway?` }
      : { action: "halt", message: `${why} Halting — raise the limit with \`--budget\` or clear it to continue.` };
  }
  if (budget.status === "warning") {
    return { action: "warn", message: `Cost guard: ${usd(budget.spentUsd)} of ${usd(budget.limitUsd)} (${usd(remainingUsd(budget))} left).` };
  }
  return { action: "allow" };
}
