import { describe, it, expect } from "vitest";
import {
  shouldImproveSkill,
  buildImprovementPrompt,
  parseImprovement,
  proposeSkillImprovement,
  type SkillUnderReview,
} from "./auto-improve.js";

const SKILL: SkillUnderReview = {
  name: "debug-failing-vitest",
  body: "1. Read the failing test.\n2. Reproduce.\n3. Fix the smallest thing.",
};
const TURN = "The skill missed that the watcher needs re-arming before the trigger.";

describe("shouldImproveSkill", () => {
  it("returns true when the skill was invoked this turn and VANTA_SKILL_IMPROVE=1", () => {
    expect(shouldImproveSkill("my-skill", true, { VANTA_SKILL_IMPROVE: "1" })).toBe(true);
  });

  it("accepts the other truthy enable spellings", () => {
    for (const v of ["true", "on", "yes"]) {
      expect(shouldImproveSkill("my-skill", true, { VANTA_SKILL_IMPROVE: v })).toBe(true);
    }
  });

  it("returns false when the skill was NOT invoked this turn (even if enabled)", () => {
    expect(shouldImproveSkill("my-skill", false, { VANTA_SKILL_IMPROVE: "1" })).toBe(false);
  });

  it("returns false when disabled / unset (default off)", () => {
    expect(shouldImproveSkill("my-skill", true, {})).toBe(false);
    expect(shouldImproveSkill("my-skill", true, { VANTA_SKILL_IMPROVE: "0" })).toBe(false);
    expect(shouldImproveSkill("my-skill", true, { VANTA_SKILL_IMPROVE: "off" })).toBe(false);
  });

  it("returns false for a blank skill name", () => {
    expect(shouldImproveSkill("  ", true, { VANTA_SKILL_IMPROVE: "1" })).toBe(false);
  });
});

describe("buildImprovementPrompt", () => {
  it("references the skill name, the skill body, and the turn summary", () => {
    const prompt = buildImprovementPrompt(SKILL, TURN);
    expect(prompt).toContain(SKILL.name);
    expect(prompt).toContain(SKILL.body);
    expect(prompt).toContain(TURN);
  });

  it("asks for the no-change sentinel and the full improved body", () => {
    const prompt = buildImprovementPrompt(SKILL, TURN);
    expect(prompt.toLowerCase()).toContain("no change");
    expect(prompt.toLowerCase()).toContain("improved");
  });

  it("substitutes a placeholder when the turn summary is empty", () => {
    const prompt = buildImprovementPrompt(SKILL, "   ");
    expect(prompt).toContain("(no turn summary provided)");
  });
});

describe("parseImprovement", () => {
  it("treats the no-change sentinel as not improved, returning the original body", () => {
    const result = parseImprovement("no change", SKILL.body);
    expect(result).toEqual({ improved: false, body: SKILL.body });
  });

  it("is case-insensitive about the sentinel", () => {
    expect(parseImprovement("No Change", SKILL.body).improved).toBe(false);
  });

  it("treats an empty / whitespace response as not improved", () => {
    expect(parseImprovement("", SKILL.body)).toEqual({ improved: false, body: SKILL.body });
    expect(parseImprovement("   \n  ", SKILL.body)).toEqual({ improved: false, body: SKILL.body });
  });

  it("treats a body identical to the original as not improved", () => {
    expect(parseImprovement(SKILL.body, SKILL.body).improved).toBe(false);
    // identical after trimming surrounding whitespace, too
    expect(parseImprovement(`\n${SKILL.body}\n`, SKILL.body).improved).toBe(false);
  });

  it("treats a genuinely different body as improved, with a note", () => {
    const better = `${SKILL.body}\n4. Re-arm the watcher before triggering.`;
    const result = parseImprovement(better, SKILL.body);
    expect(result.improved).toBe(true);
    expect(result.body).toBe(better);
    expect(result.note).toBeTruthy();
  });

  it("strips a surrounding markdown code fence from the proposed body", () => {
    const better = "1. New first step.\n2. New second step.";
    const result = parseImprovement("```md\n" + better + "\n```", SKILL.body);
    expect(result.improved).toBe(true);
    expect(result.body).toBe(better);
  });
});

describe("proposeSkillImprovement", () => {
  it("returns a real improvement proposal via the injected complete", async () => {
    const better = `${SKILL.body}\n4. Re-arm the watcher first.`;
    const result = await proposeSkillImprovement(SKILL, TURN, {
      complete: async () => better,
    });
    expect(result.improved).toBe(true);
    expect(result.body).toBe(better);
    expect(result.note).toBeTruthy();
  });

  it("passes a prompt that includes the body and the turn to complete", async () => {
    let seen = "";
    await proposeSkillImprovement(SKILL, TURN, {
      complete: async (prompt) => {
        seen = prompt;
        return "no change";
      },
    });
    expect(seen).toContain(SKILL.body);
    expect(seen).toContain(TURN);
  });

  it("returns a no-change proposal when the model says no change", async () => {
    const result = await proposeSkillImprovement(SKILL, TURN, {
      complete: async () => "no change",
    });
    expect(result).toEqual({ improved: false, body: SKILL.body });
  });

  it("never throws — a complete() throw yields a no-change proposal with the original body", async () => {
    const result = await proposeSkillImprovement(SKILL, TURN, {
      complete: async () => {
        throw new Error("provider exploded");
      },
    });
    expect(result).toEqual({ improved: false, body: SKILL.body });
  });
});
