// DRIFT-HARD-ENFORCE — a per-turn tool-budget circuit breaker.
//
// The existing per-turn guards only catch IDENTICAL calls (MAX_IDENTICAL_CALLS),
// CONSECUTIVE empty results (MAX_CONSECUTIVE_FAILURES), or an all-read-only
// research run (the adaptive `researchOnly` redirect). A turn that keeps calling
// VARIED, SUCCEEDING tools toward the wrong thing sails past every one of them
// until the 50-iteration ceiling errors out — exactly what happened in the
// session that motivated this: many tools per turn, none of them "the ask".
//
// This adds a two-phase upper bound. The acquisition phase closes before the
// hard ceiling, leaving a fixed reserve for synthesis, verification, output,
// and checklist closure. Corrected turns retain a bounded ceiling but must still
// have enough room to finish a legitimate build or repair.
//
// Honest scope: you cannot mechanically tell an on-goal tool call from an
// off-goal one without a classifier, so this is a blunt RUNAWAY backstop, not a
// semantic drift judge. It pairs with the goal-adherence note (nd inhibit gate)
// + the adaptive redirect, which handle intent; this just caps volume and yields.

/** Default per-turn ceiling — high enough for a real multi-step build while still
 * bounding pathological tool loops. Repetition/stall guards should stop bad loops
 * first; this is the last-resort volume backstop, not a routine workflow boundary. */
export const DEFAULT_TOOL_BUDGET = 120;
/** Corrected turns still get enough room to finish the requested repair. */
export const CORRECTION_TOOL_BUDGET = 60;
/** Calls reserved inside the ceiling for verification, output, and checklist closure. */
export const DEFAULT_TOOL_CLOSURE_RESERVE = 20;

/** Resolve the effective budget: `VANTA_TOOL_BUDGET` overrides; `0`/negative disables. */
export function resolveToolBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = parseInt(env.VANTA_TOOL_BUDGET ?? "", 10);
  if (Number.isNaN(raw)) return DEFAULT_TOOL_BUDGET;
  return raw < 0 ? 0 : raw; // explicit override; 0 = disabled (autonomous / grind mode)
}

/** Resolve the predeclared closure reserve; invalid values use the default. */
export function resolveToolClosureReserve(env: NodeJS.ProcessEnv = process.env): number {
  const raw = parseInt(env.VANTA_TOOL_CLOSURE_RESERVE ?? "", 10);
  if (Number.isNaN(raw)) return DEFAULT_TOOL_CLOSURE_RESERVE;
  return Math.max(0, raw);
}

/** Effective hard ceiling for this turn and interaction mode. */
export function effectiveToolBudget(correction: boolean, budget: number): number {
  if (budget <= 0) return 0;
  return correction ? Math.min(budget, CORRECTION_TOOL_BUDGET) : budget;
}

/** Point at which acquisition closes and the already-budgeted finish reserve begins. */
export function toolClosureThreshold(
  correction: boolean,
  budget: number,
  reserve = DEFAULT_TOOL_CLOSURE_RESERVE,
): number {
  const hard = effectiveToolBudget(correction, budget);
  if (hard <= 0) return 0;
  const boundedReserve = Math.min(Math.max(0, reserve), Math.max(0, hard - 1));
  return Math.max(1, hard - boundedReserve);
}

/**
 * Whether acquisition should close so the remaining predeclared budget is
 * spent finishing the deliverable. A budget of 0 disables the breaker.
 */
export function shouldEnterToolClosure(
  toolIterations: number,
  correction: boolean,
  budget: number,
  reserve = DEFAULT_TOOL_CLOSURE_RESERVE,
): boolean {
  const hard = effectiveToolBudget(correction, budget);
  return hard > 0 && toolIterations >= toolClosureThreshold(correction, budget, reserve) && toolIterations < hard;
}

/** Whether the hard per-turn tool ceiling has been spent. */
export function shouldHaltForToolBudget(toolIterations: number, correction: boolean, budget: number): boolean {
  const hard = effectiveToolBudget(correction, budget);
  return hard > 0 && toolIterations >= hard;
}

const ACQUISITION_TOOLS = new Set([
  "web_search",
  "web_fetch",
  "browser_navigate",
  "browser_read",
  "browser_extract",
  "browser_act",
]);

export function isToolAllowedDuringClosure(name: string): boolean {
  return !ACQUISITION_TOOLS.has(name);
}

/** Remove broad acquisition tools while preserving output and verification tools. */
export function scopeToolsForClosure<T extends { name: string }>(schemas: ReadonlyArray<T>): T[] {
  return schemas.filter((schema) => isToolAllowedDuringClosure(schema.name));
}

/** Private directive injected throughout the bounded finishing phase. */
export function buildToolClosureDirective(openTodoCount: number | null): string {
  const plan = openTodoCount && openTodoCount > 0
    ? `The live checklist still has ${openTodoCount} open item${openTodoCount === 1 ? "" : "s"}.`
    : "No open checklist count is available.";
  return [
    "[VANTA TOOL-BUDGET CLOSURE — private loop directive]",
    "The acquisition phase is closed; the hard tool-call ceiling has not been raised.",
    plan,
    "Stop searching, fetching, browsing, and expanding the plan. Use evidence already collected.",
    "Finish the requested deliverable now, perform only narrow necessary verification, and update every completed checklist item before returning.",
    "Do not ask the operator what to do next unless a genuinely external decision or unsafe action blocks completion.",
  ].join("\n");
}

/** The terminal receipt shown only when the hard ceiling is actually exhausted. */
export function buildToolBudgetSummary(toolNames: ReadonlyArray<string>, correction: boolean): string {
  const seen: string[] = [];
  for (const name of toolNames) if (!seen.includes(name)) seen.push(name);
  const lead = correction
    ? `Stopped at the hard safety limit after ${toolNames.length} tool calls while correcting course.`
    : `Stopped at the hard safety limit after ${toolNames.length} tool calls.`;
  return `${lead}\n  Tools used: ${seen.join(", ") || "none"}.\n  The current goal and unfinished checklist remain preserved; “continue” resumes from that state.`;
}
