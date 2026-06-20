// Where to put the human in the self-correction loop.
//
// SELFHARNESS-DIFF-GATE: full automation costs more trust than it saves only at
// ONE step — applying the diff. Root-causing and regression-locking are
// low-signal: automate them fully. Drafting the fix is autonomous too (a draft
// changes nothing until it lands). The high-signal / high-trust step is the
// DIFF APPLICATION — that one stays human/kernel-gated, and nothing auto-merges.
//
// This module is the pure, testable encoding of that rule. The loop and the
// tool consult it so the "human only at diff" policy is explicit and enforced,
// not an accident of how the fix subagent happens to be wired.

/** The ordered steps of one self-correction pass. */
export type SelfCorrectStep = "confirm-failure" | "diagnose" | "draft" | "apply-diff" | "rerun" | "lock";

/** Who owns a step: the agent runs it alone, or a human/kernel gate must clear it first. */
export type StepAuthority = "autonomous" | "human-gated";

export type StepPolicy = {
  step: SelfCorrectStep;
  authority: StepAuthority;
  /** True only for `apply-diff`: this is where a change actually lands. */
  mutatesWorkspace: boolean;
  reason: string;
};

// The single source of truth for the rule. Diagnosis/draft + the read-only
// confirm/rerun + the regression lock are autonomous; ONLY applying the diff is
// human-gated, because that is the only step that mutates the workspace.
const POLICY: readonly StepPolicy[] = [
  { step: "confirm-failure", authority: "autonomous", mutatesWorkspace: false, reason: "read-only: reproduce the failure" },
  { step: "diagnose", authority: "autonomous", mutatesWorkspace: false, reason: "low-signal: root-cause analysis changes nothing" },
  { step: "draft", authority: "autonomous", mutatesWorkspace: false, reason: "a drafted fix lands nothing until applied" },
  { step: "apply-diff", authority: "human-gated", mutatesWorkspace: true, reason: "high-trust: applying the diff is the only mutation — human/kernel must approve" },
  { step: "rerun", authority: "autonomous", mutatesWorkspace: false, reason: "read-only: re-run the failing input to confirm" },
  { step: "lock", authority: "autonomous", mutatesWorkspace: false, reason: "low-signal: recording a regression lock is safe" },
];

const POLICY_BY_STEP: ReadonlyMap<SelfCorrectStep, StepPolicy> = new Map(POLICY.map((p) => [p.step, p]));

/** The full ordered policy table — every step's authority and why. */
export function diffGatePolicy(): readonly StepPolicy[] {
  return POLICY;
}

export function policyFor(step: SelfCorrectStep): StepPolicy {
  const p = POLICY_BY_STEP.get(step);
  if (!p) throw new Error(`unknown self-correction step: "${step}". Expected one of ${[...POLICY_BY_STEP.keys()].join(", ")}.`);
  return p;
}

/** Does this step run without a human/kernel gate? Diagnose + draft = yes; apply-diff = no. */
export function isAutonomousStep(step: SelfCorrectStep): boolean {
  return policyFor(step).authority === "autonomous";
}

/** Does this step require the human/kernel diff-application gate? */
export function requiresHumanGate(step: SelfCorrectStep): boolean {
  return policyFor(step).authority === "human-gated";
}

/** The one step where the human belongs: applying the diff. */
export function humanGatedStep(): SelfCorrectStep {
  return "apply-diff";
}

/**
 * Nothing auto-merges: there is exactly one mutating step, it is human-gated,
 * and no autonomous step mutates the workspace. A true result is the invariant
 * the loop relies on — if a future edit makes a mutating step autonomous, this
 * returns false and the guarding test fails.
 */
export function nothingAutoMerges(): boolean {
  const mutating = POLICY.filter((p) => p.mutatesWorkspace);
  return mutating.length === 1 && mutating.every((p) => p.authority === "human-gated");
}

export type GateDecision = { allowed: boolean; gate: "none" | "human"; reason: string };

/**
 * The decision the loop asks for at each step: an autonomous step proceeds with
 * no gate; the diff-application step proceeds only behind the human/kernel gate.
 * Pure — the caller (loop/tool) supplies the real approval; this only says where.
 */
export function decideStep(step: SelfCorrectStep): GateDecision {
  const p = policyFor(step);
  return p.authority === "autonomous"
    ? { allowed: true, gate: "none", reason: p.reason }
    : { allowed: true, gate: "human", reason: p.reason };
}
