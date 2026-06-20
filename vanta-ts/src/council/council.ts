/**
 * AGENT-COUNCIL — a bounded council of fixed role-personas that deliberates on
 * one question in a single pass, then a Reflection role synthesizes the lenses
 * into ONE consolidated recommendation.
 *
 * "Bounded" = a fixed, capped roster ({@link COUNCIL_ROLES}) and exactly one
 * deliberation pass + one synthesis step — no unbounded recursion or fan-out.
 * This module is PURE orchestration: the role-runner is injected, so the whole
 * fan-out + synthesis is testable with no real LLM or subagent spawn.
 */

/** One fixed council persona: its name, the lens it argues from, and its brief. */
export type CouncilRole = {
  /** Stable identifier used in transcripts/output (e.g. "CEO"). */
  readonly name: string;
  /** The perspective this role contributes from (drives its prompt). */
  readonly lens: string;
  /** What this role is asked to produce. */
  readonly brief: string;
};

/**
 * The fixed deliberation roster (capped at {@link COUNCIL_CAP}). The last entry
 * is the synthesis/Reflection role — it does NOT deliberate in the fan-out; it
 * consolidates the others' answers into one recommendation.
 */
export const COUNCIL_ROLES: readonly CouncilRole[] = [
  { name: "CEO", lens: "vision, strategy, and overall direction", brief: "Judge the question against the mission and long-term direction." },
  { name: "CTO", lens: "technical feasibility, architecture, and risk", brief: "Judge technical feasibility, complexity, and engineering risk." },
  { name: "COO", lens: "execution, operations, and sequencing", brief: "Judge how this gets executed: steps, dependencies, and operational cost." },
  { name: "CFO", lens: "cost, budget, and financial risk", brief: "Judge the cost, budget impact, and financial risk." },
  { name: "Reflection", lens: "synthesis across every other lens", brief: "Reconcile the lenses into ONE consolidated recommendation, naming tradeoffs." },
] as const;

/** Hard cap on the roster — guards against an unbounded council. */
export const COUNCIL_CAP = 7;

/** A single role's contribution to the deliberation. */
export type RoleAnswer = {
  readonly role: string;
  readonly lens: string;
  readonly answer: string;
};

/**
 * Runs one council role against a question (or, for the synthesis role, against
 * the question plus the deliberation answers). Injected so the orchestration is
 * pure and testable; the live tool wires this to a scoped subagent spawn.
 */
export type RoleRunner = (input: {
  readonly role: CouncilRole;
  readonly question: string;
  /** Present only for the synthesis role: every deliberating role's answer. */
  readonly priorAnswers?: readonly RoleAnswer[];
}) => Promise<string>;

export type CouncilDeps = {
  readonly runRole: RoleRunner;
  /** Override the roster (still capped); defaults to {@link COUNCIL_ROLES}. */
  readonly roster?: readonly CouncilRole[];
};

export type CouncilResult = {
  /** Each deliberating role's contribution, in roster order. */
  readonly answers: readonly RoleAnswer[];
  /** The Reflection role's single consolidated recommendation. */
  readonly recommendation: string;
};

/** Refuse a roster larger than the cap — keeps the council bounded. */
function assertBounded(roster: readonly CouncilRole[]): void {
  if (roster.length < 2) {
    throw new Error("council needs at least 2 roles (deliberation + synthesis)");
  }
  if (roster.length > COUNCIL_CAP) {
    throw new Error(`council roster capped at ${COUNCIL_CAP} roles, got ${roster.length}`);
  }
}

/**
 * Run the bounded council: every non-synthesis role answers the question from
 * its lens (one pass), then the final (synthesis) role consolidates those
 * answers into one recommendation. The synthesis role is always the LAST entry.
 */
export async function runCouncil(question: string, deps: CouncilDeps): Promise<CouncilResult> {
  const q = question.trim();
  if (q.length === 0) throw new Error("council needs a non-empty question");

  const roster = deps.roster ?? COUNCIL_ROLES;
  assertBounded(roster);

  const deliberators = roster.slice(0, -1);
  const synthesisRole = roster.at(-1);
  if (!synthesisRole) throw new Error("council roster is empty");

  const answers: RoleAnswer[] = [];
  for (const role of deliberators) {
    const answer = await deps.runRole({ role, question: q });
    answers.push({ role: role.name, lens: role.lens, answer });
  }

  const recommendation = await deps.runRole({
    role: synthesisRole,
    question: q,
    priorAnswers: answers,
  });

  return { answers, recommendation };
}

/** Format a council result for an operator-facing readout. */
export function formatCouncil(question: string, result: CouncilResult): string {
  const lenses = result.answers
    .map((a) => `[${a.role} · ${a.lens}]\n${a.answer}`)
    .join("\n\n");
  return `Council on: ${question}\n\n${lenses}\n\n[Recommendation]\n${result.recommendation}`;
}
