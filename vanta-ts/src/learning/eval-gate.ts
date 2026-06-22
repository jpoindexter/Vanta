import type { Skill } from "../skills/types.js";

// VANTA-SELF-LEARNING-LOOP — the eval-gate: a proposed skill is ADOPTED only if it
// passes this. The default is a CHEAP, deterministic regression/safety gate (runs
// post-turn, on by default) that blocks the known failure modes a learned skill
// can introduce. The signature is injectable so the heavier AHE skill-eval corpus
// harness (skill-eval/) can be plugged as a stronger gate when proof-by-eval is
// wanted; `runLearningCycle` takes the gate as a dependency.

const MIN_BODY_CHARS = 40;

/**
 * Refusal / negative-claim shapes. `background-review.ts` warns the reviewer
 * against capturing these because they harden into self-imposed refusals ("tool X
 * is broken" → Vanta stops trying tool X). The gate enforces it deterministically.
 */
const REFUSAL_PATTERNS: readonly RegExp[] = [
  /\bis broken\b/i,
  /\b(does ?n['’]?t|did ?n['’]?t|won['’]?t) work\b/i,
  /\b(can ?not|can['’]?t) be (done|used)\b/i,
  /\bnever (use|try|call)\b/i,
  /\b(do ?n['’]?t|don['’]?t) use\b/i,
  /\bunsupported\b/i,
];

export type GateResult = { passed: boolean; reason: string };

/**
 * Default deterministic gate. Rejects a proposed skill that:
 *  - has too thin a body to be a reusable procedure,
 *  - reads as a refusal / negative claim (hardens into a self-imposed limit), or
 *  - would shadow an existing HAND-AUTHORED skill of the same name.
 * Otherwise adopts. Pure — `handAuthoredNames` is the set of curated skill names.
 */
export function gateSkill(skill: Skill, handAuthoredNames: ReadonlySet<string>): GateResult {
  const body = skill.body.trim();
  if (body.length < MIN_BODY_CHARS) {
    return { passed: false, reason: `body too thin (${body.length} chars) to be a reusable skill` };
  }
  const text = `${skill.meta.description}\n${body}`;
  for (const pat of REFUSAL_PATTERNS) {
    if (pat.test(text)) {
      return { passed: false, reason: "reads as a refusal/negative claim (would harden into a self-imposed limit)" };
    }
  }
  if (handAuthoredNames.has(skill.meta.name)) {
    return { passed: false, reason: `would shadow the hand-authored skill "${skill.meta.name}"` };
  }
  return { passed: true, reason: "passed regression/safety gate" };
}
