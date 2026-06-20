import { describe, it, expect } from "vitest";
import {
  SKILL_EVAL_TASKS,
  SkillEvalTaskSchema,
  gradeTask,
  type SkillEvalTask,
} from "./corpus.js";

describe("skill-eval corpus", () => {
  it("has at least 8 skill-sensitive tasks", () => {
    expect(SKILL_EVAL_TASKS.length).toBeGreaterThanOrEqual(8);
  });

  it("has unique task ids", () => {
    const ids = SKILL_EVAL_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every task zod-validates", () => {
    for (const task of SKILL_EVAL_TASKS) {
      expect(() => SkillEvalTaskSchema.parse(task)).not.toThrow();
    }
  });

  it("covers more than one distinct skill (skill-sensitivity, not one trick)", () => {
    const slugs = new Set(SKILL_EVAL_TASKS.map((t) => t.skillSlug));
    expect(slugs.size).toBeGreaterThanOrEqual(5);
  });

  it("uses every check kind across the corpus", () => {
    const kinds = new Set(SKILL_EVAL_TASKS.map((t) => t.check.kind));
    expect(kinds).toEqual(new Set(["includes", "notIncludes", "regex"]));
  });
});

// Inline fixtures: one task per check kind, each graded against a correct and a
// wrong candidate answer. This proves the grader discriminates per kind.
const INCLUDES_TASK: SkillEvalTask = {
  id: "fx-includes",
  prompt: "p",
  skillSlug: "source-grounded",
  check: { kind: "includes", value: "UNVERIFIED" },
  rationale: "r",
};
const NOT_INCLUDES_TASK: SkillEvalTask = {
  id: "fx-not-includes",
  prompt: "p",
  skillSlug: "ship-preflight",
  check: { kind: "notIncludes", value: "deploying now" },
  rationale: "r",
};
const REGEX_TASK: SkillEvalTask = {
  id: "fx-regex",
  prompt: "p",
  skillSlug: "nd-time-blindness",
  check: { kind: "regex", value: "best[\\s-]?case[\\s\\S]*realistic" },
  rationale: "r",
};

describe("gradeTask", () => {
  it("includes: passes when the value is present, fails when absent", () => {
    expect(gradeTask(INCLUDES_TASK, "this is UNVERIFIED, verify before prod").pass).toBe(true);
    expect(gradeTask(INCLUDES_TASK, "this is correct and cited").pass).toBe(false);
  });

  it("includes: is case-insensitive", () => {
    expect(gradeTask(INCLUDES_TASK, "marked unverified for safety").pass).toBe(true);
  });

  it("notIncludes: passes when forbidden text absent, fails when present", () => {
    expect(gradeTask(NOT_INCLUDES_TASK, "green — here is the deploy command").pass).toBe(true);
    expect(gradeTask(NOT_INCLUDES_TASK, "all good, deploying now").pass).toBe(false);
  });

  it("regex: passes a matching answer, fails a bare single estimate", () => {
    const good = "Best case 1h, realistic 2-3h with hidden costs";
    expect(gradeTask(REGEX_TASK, good).pass).toBe(true);
    expect(gradeTask(REGEX_TASK, "About an hour.").pass).toBe(false);
  });

  it("reports a human-readable reason for both pass and fail", () => {
    expect(gradeTask(INCLUDES_TASK, "UNVERIFIED").reason).toContain("UNVERIFIED");
    expect(gradeTask(INCLUDES_TASK, "nope").reason).toMatch(/missing/);
  });
});

describe("every corpus task is gradable (a correct answer passes its own check)", () => {
  // Each task's own check.value is, by construction, the discriminating signal —
  // an answer containing it must pass (includes/regex) or omitting it must pass
  // (notIncludes). This guards against a check that can never pass.
  for (const task of SKILL_EVAL_TASKS) {
    it(task.id, () => {
      const witness =
        task.check.kind === "notIncludes" ? "a clean answer" : `answer: ${task.check.value}`;
      // For regex tasks the raw value may not be literal text; assert the check
      // is at least well-formed and that notIncludes/includes witnesses behave.
      if (task.check.kind === "includes") {
        expect(gradeTask(task, witness).pass).toBe(true);
      } else if (task.check.kind === "notIncludes") {
        expect(gradeTask(task, witness).pass).toBe(true);
      } else {
        // regex: ensure it compiles and grading does not throw
        expect(() => gradeTask(task, witness)).not.toThrow();
      }
    });
  }
});
