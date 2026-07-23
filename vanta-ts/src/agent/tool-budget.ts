// DRIFT-HARD-ENFORCE — a per-turn tool-budget circuit breaker.
//
// The existing per-turn guards only catch IDENTICAL calls (MAX_IDENTICAL_CALLS),
// CONSECUTIVE empty results (MAX_CONSECUTIVE_FAILURES), or an all-read-only
// research run (the adaptive `researchOnly` redirect). A turn that keeps calling
// VARIED, SUCCEEDING tools toward the wrong thing sails past every one of them
// until the 50-iteration ceiling errors out — exactly what happened in the
// session that motivated this: many tools per turn, none of them "the ask".
//
// This adds a graceful upper bound: past the budget the turn HALTS and yields
// control back to the user (who can redirect) instead of burning more tools.
// The ceiling tightens while the user is actively CORRECTING the agent, because
// a corrected turn that keeps spelunking is the precise "not listening" failure.
//
// Honest scope: you cannot mechanically tell an on-goal tool call from an
// off-goal one without a classifier, so this is a blunt RUNAWAY backstop, not a
// semantic drift judge. It pairs with the goal-adherence note (nd inhibit gate)
// + the adaptive redirect, which handle intent; this just caps volume and yields.

/** Default per-turn tool ceiling — a runaway backstop, kept below the 50-iter limit. */
export const DEFAULT_TOOL_BUDGET = 30;
/** Tighter ceiling while the user is correcting/re-asking this turn. */
export const CORRECTION_TOOL_BUDGET = 10;

/** Resolve the effective budget: `VANTA_TOOL_BUDGET` overrides; `0`/negative disables. */
export function resolveToolBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = parseInt(env.VANTA_TOOL_BUDGET ?? "", 10);
  if (Number.isNaN(raw)) return DEFAULT_TOOL_BUDGET;
  return raw < 0 ? 0 : raw; // explicit override; 0 = disabled (autonomous / grind mode)
}

/**
 * Whether this turn has spent its tool budget and must yield to the user. Pure.
 * `correction` = the user is actively correcting the agent this turn (tighter
 * leash). A budget of 0 disables the breaker entirely.
 */
export function shouldHaltForToolBudget(toolIterations: number, correction: boolean, budget: number): boolean {
  if (budget <= 0) return false;
  const ceiling = correction ? Math.min(budget, CORRECTION_TOOL_BUDGET) : budget;
  return toolIterations >= ceiling;
}

/** The yield-to-user summary shown when the tool budget halts a turn. Pure. */
export function buildToolBudgetSummary(toolNames: ReadonlyArray<string>, correction: boolean): string {
  const seen: string[] = [];
  for (const name of toolNames) if (!seen.includes(name)) seen.push(name);
  const lead = correction
    ? `Halted: I ran ${toolNames.length} tools this turn while you were redirecting me, without landing your ask.`
    : `Halted: I ran ${toolNames.length} tools this turn without finishing — stopping to check in rather than burn more.`;
  return `${lead}\n  Tools used: ${seen.join(", ") || "none"}.\n  Tell me the one thing to do next and I'll do exactly that.`;
}
