import { classifyDecision, routeDecision, type DecisionClass } from "../repl/decision-classifier.js";

// DECISION-CLASSIFIER (wiring) — the per-run decision ledger + the gate guard.
// Before an auto-approve grant (acceptEdits / delegated authority) silently
// clears an ask, classify the decision against the operator's stated direction:
//   user-challenge → the grant is REFUSED and the decision reaches the operator.
//   taste          → auto-decided, but RECORDED so it surfaces at the final gate.
//   mechanical     → auto-decided silently.
// The log is a plain module-level accumulator (one process = one run); the loop
// / REPL drains it at the final gate. Pure decisions; the log is the only state.

export type LoggedDecision = { action: string; class: DecisionClass; at: string };

const log: LoggedDecision[] = [];

/**
 * True when a decision OVERRIDES the operator's stated direction (user-challenge)
 * and therefore must NOT ride a blanket auto-approve grant — the caller forces
 * the prompt. Pure; no logging (a forced-to-prompt decision wasn't auto-made).
 */
export function autoApproveOverridden(action: string, statedDirection: string | undefined): boolean {
  return classifyDecision({ action, statedDirection }) === "user-challenge";
}

/**
 * Record a decision that a grant is about to AUTO-APPROVE: a taste decision is
 * logged for the final-gate batch (viable alternatives existed); mechanical is
 * silent. Called only on the auto-approve branch, so a prompted decision is
 * never mislabeled as auto-made. Pure w.r.t. inputs (appends to the run log).
 */
export function recordAutoDecision(action: string, statedDirection: string | undefined, now: Date = new Date()): void {
  if (classifyDecision({ action, statedDirection }) === "taste") {
    log.push({ action, class: "taste", at: now.toISOString() });
  }
}

/** The route for a decision (used by callers that want the full verdict). Pure. */
export function decisionRoute(action: string, statedDirection: string | undefined): ReturnType<typeof routeDecision> {
  return routeDecision(classifyDecision({ action, statedDirection }));
}

/** Drain the batched taste decisions (the final-gate surface clears them). */
export function drainDecisions(): LoggedDecision[] {
  return log.splice(0);
}

/** Peek without clearing (status/where views). */
export function peekDecisions(): readonly LoggedDecision[] {
  return log;
}

/** A human summary of the batched taste decisions, or null when none pending. Pure. */
export function summarizeDecisions(decisions: readonly LoggedDecision[]): string | null {
  if (!decisions.length) return null;
  const lines = decisions.map((d) => `  · ${d.action}`);
  return `${decisions.length} taste decision(s) auto-made this run (viable alternatives existed):\n${lines.join("\n")}`;
}
