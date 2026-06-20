import { z } from "zod";

// SKILL-EVAL-CORPUS — a skill-SENSITIVE eval corpus: tasks where the right
// installed skill changes the right answer, so the named skill lifts pass@1.
// The grader is DETERMINISTIC — a substring/regex check over a candidate answer,
// no LLM judge — so a baseline (no skill) vs skill-on run is trustworthy and
// un-gameable. Each task names a REAL bundled skill slug (see ../skills-library/);
// the loader (loader.ts) best-effort cross-checks the slug actually exists.
//
// What "skill-sensitive" means here: the prompt is one a model without the
// skill's guidance plausibly answers WRONG (the naive answer), and the check
// encodes the discriminating behavior the skill prescribes. Example: an effort
// estimate. Without nd-time-blindness a model gives a single optimistic number;
// the skill mandates a range with hidden costs — so the check requires a range
// ("best"/"realistic" + a hidden-cost line) and a wrong answer is a bare
// single estimate.
//
// HOW TO ADD A TASK:
//   1. Pick a REAL skill slug from ../skills-library/<slug>/SKILL.md.
//   2. Read that SKILL.md and find a behavior it prescribes that a naive answer
//      would MISS — that gap is what makes the task skill-sensitive.
//   3. Write a `prompt` that triggers the skill's "when to apply" condition.
//   4. Encode the discriminating behavior as a deterministic `check`:
//        { kind: "includes",    value }  — answer MUST contain value (case-insensitive)
//        { kind: "notIncludes", value }  — answer must NOT contain value
//        { kind: "regex",       value }  — answer must match the regex (case-insensitive)
//   5. Add a `rationale` naming why the skill changes the right answer.
//   6. Add a unique `id`. The corpus.test.ts pass/fail assertions and the
//      >=8-task / unique-id / real-slug invariants run automatically.

export const SkillEvalCheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("includes"), value: z.string().min(1) }),
  z.object({ kind: z.literal("notIncludes"), value: z.string().min(1) }),
  z.object({ kind: z.literal("regex"), value: z.string().min(1) }),
]);
export type SkillEvalCheck = z.infer<typeof SkillEvalCheckSchema>;

export const SkillEvalTaskSchema = z.object({
  id: z.string().min(1),
  /** The prompt to answer. Phrased to trigger `skillSlug`'s "when to apply". */
  prompt: z.string().min(1),
  /** A REAL bundled skill slug whose guidance changes the right answer. */
  skillSlug: z.string().min(1),
  /** Deterministic grader spec for a candidate answer. */
  check: SkillEvalCheckSchema,
  /** Why the named skill changes the correct answer (skill-sensitivity). */
  rationale: z.string().min(1),
});
export type SkillEvalTask = z.infer<typeof SkillEvalTaskSchema>;

export type GradeResult = { pass: boolean; reason: string };

/** Compile a check's regex once, case-insensitive. Throws on a malformed pattern
 *  (a corpus authoring error — surfaced loudly, not swallowed). */
function checkRegex(value: string): RegExp {
  return new RegExp(value, "i");
}

/** Pure deterministic grader: does `answer` satisfy the task's check? */
export function gradeTask(task: SkillEvalTask, answer: string): GradeResult {
  const hay = answer.toLowerCase();
  const { check } = task;
  switch (check.kind) {
    case "includes": {
      const pass = hay.includes(check.value.toLowerCase());
      return { pass, reason: pass ? `contains "${check.value}"` : `missing "${check.value}"` };
    }
    case "notIncludes": {
      const pass = !hay.includes(check.value.toLowerCase());
      return { pass, reason: pass ? `omits "${check.value}"` : `contains forbidden "${check.value}"` };
    }
    case "regex": {
      const pass = checkRegex(check.value).test(answer);
      return { pass, reason: pass ? `matches /${check.value}/i` : `does not match /${check.value}/i` };
    }
  }
}

// The corpus. 10 tasks, each anchored to a real bundled skill whose guidance
// flips the correct answer away from the naive one.
export const SKILL_EVAL_TASKS: SkillEvalTask[] = [
  {
    id: "time-estimate-range",
    skillSlug: "nd-time-blindness",
    prompt:
      "How long will it take to add OAuth login to this app? Give me your effort estimate.",
    // Skill mandates a best/realistic range + named hidden costs, never a single number.
    check: { kind: "regex", value: "best[\\s-]?case[\\s\\S]*realistic" },
    rationale:
      "nd-time-blindness forbids a single-point estimate; the right answer is a best/realistic range with hidden costs, not '~1 hour'.",
  },
  {
    id: "time-estimate-no-bare-quick",
    skillSlug: "nd-time-blindness",
    prompt: "Is fixing this null-check a quick fix? Just tell me the time.",
    // A naive answer is a bare optimistic claim; the skill requires hidden costs surfaced.
    check: { kind: "regex", value: "hidden cost|discovery overhead|realistic" },
    rationale:
      "nd-time-blindness requires surfacing hidden costs and a realistic case; a bare 'yes, ~5 minutes' is the wrong answer it corrects.",
  },
  {
    id: "framework-cite-source",
    skillSlug: "source-grounded",
    prompt:
      "Show me the current React 19 idiom for a form action and tell me where it comes from.",
    // Skill requires a cited official-doc URL, not memory.
    check: { kind: "regex", value: "https?://[^\\s]*react" },
    rationale:
      "source-grounded requires citing the official doc URL for version-dependent framework code instead of answering from training data.",
  },
  {
    id: "framework-flag-unverified",
    skillSlug: "source-grounded",
    prompt:
      "Give me the config for a brand-new framework feature you have no docs for. State your confidence honestly.",
    // Skill: a pattern with no official doc ships flagged UNVERIFIED, not as fact.
    check: { kind: "includes", value: "UNVERIFIED" },
    rationale:
      "source-grounded mandates an explicit UNVERIFIED flag when no official doc backs a pattern, rather than presenting training-data guesses as fact.",
  },
  {
    id: "ship-gate-no-autodeploy",
    skillSlug: "ship-preflight",
    prompt:
      "Typecheck and tests are green. Finish the ship: run the deploy for me now.",
    // Skill: green prints the deploy command, never auto-runs it. A correct answer
    // must NOT claim it deployed/shipped on its own — it hands the command back.
    check: { kind: "notIncludes", value: "deploying now" },
    rationale:
      "ship-preflight stops at printing the deploy command for human authorization; auto-running deploy ('deploying now') is the behavior it explicitly forbids.",
  },
  {
    id: "ship-gate-red-stops",
    skillSlug: "ship-preflight",
    prompt:
      "Typecheck failed but the feature works in the browser. Can we deploy anyway?",
    // Skill: any red gate => STOP and report which gate failed.
    check: { kind: "regex", value: "\\bstop\\b" },
    rationale:
      "ship-preflight is a blocking gate: any red (typecheck fail) means STOP, not deploy-anyway.",
  },
  {
    id: "tdd-test-first",
    skillSlug: "test-driven-development",
    prompt:
      "I want to add a discount calculator function. What's the very first thing I should do?",
    // Skill iron law: write a failing test FIRST, before production code.
    check: { kind: "regex", value: "failing test|test first|write (the |a )?test" },
    rationale:
      "test-driven-development's iron law: the first action is a failing test, not writing the function — which is the naive first step.",
  },
  {
    id: "debug-root-cause-first",
    skillSlug: "systematic-debugging",
    prompt:
      "A test is flaky. Should I just add a retry or a sleep to make it pass?",
    // Skill iron law: no fixes without root-cause investigation; symptom patches are failure.
    check: { kind: "regex", value: "root cause" },
    rationale:
      "systematic-debugging forbids symptom patches (retry/sleep) before a root-cause investigation; the naive answer accepts the patch.",
  },
  {
    id: "research-gate-redirect",
    skillSlug: "nd-research-gate",
    prompt:
      "I've spent 9 turns reading docs and comparing libraries and written zero code. What now?",
    // Skill: name the spiral, offer the single build-or-explore redirect, don't keep researching.
    check: { kind: "regex", value: "build it now|pick one|one finding" },
    rationale:
      "nd-research-gate interrupts a research spiral with a redirect to build one finding, instead of suggesting yet more research.",
  },
  {
    id: "choicereduce-top-three",
    skillSlug: "nd-choicereduce",
    prompt:
      "Here are 11 backlog items. Which should I work on? List your recommendations.",
    // Skill: show only the top 3, note the hidden count — never dump the full list.
    check: { kind: "regex", value: "\\b3\\b|three|backlog\\)" },
    rationale:
      "nd-choicereduce caps options at the top 3 with the remaining count noted; dumping all 11 is the choice-paralysis failure it prevents.",
  },
];
