import { describe, it, expect } from "vitest";
import { estTokens } from "../compress/types.js";
import {
  SkillSettingsSchema,
  clipSkillDescription,
  applySkillBudget,
  DEFAULT_DESC_MAX_CHARS,
  type RankedSkill,
} from "./budget.js";

/** Build N ranked skills with fixed-shape names/descriptions for deterministic costs. */
function ranked(n: number, descLen = 20): RankedSkill[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `skill-${i}`,
    description: "x".repeat(descLen),
  }));
}

/** The rendered cost of one `- name: desc` line, mirroring the module/prompt shape. */
function lineTokens(s: RankedSkill): number {
  return estTokens(`- ${s.name}: ${s.description}`);
}

function indexTokens(skills: RankedSkill[]): number {
  return skills.length ? estTokens(skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")) : 0;
}

describe("SkillSettingsSchema", () => {
  it("accepts an empty block", () => {
    expect(SkillSettingsSchema.parse({})).toEqual({});
  });

  it("accepts all three positive-integer caps", () => {
    const parsed = SkillSettingsSchema.parse({
      contextBudgetTokens: 500,
      maxSkills: 10,
      descriptionMaxChars: 80,
    });
    expect(parsed).toEqual({ contextBudgetTokens: 500, maxSkills: 10, descriptionMaxChars: 80 });
  });

  it("rejects non-positive caps", () => {
    expect(SkillSettingsSchema.safeParse({ maxSkills: 0 }).success).toBe(false);
    expect(SkillSettingsSchema.safeParse({ contextBudgetTokens: -1 }).success).toBe(false);
    expect(SkillSettingsSchema.safeParse({ descriptionMaxChars: 0 }).success).toBe(false);
  });

  it("rejects non-integer caps", () => {
    expect(SkillSettingsSchema.safeParse({ maxSkills: 2.5 }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(SkillSettingsSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
});

describe("clipSkillDescription", () => {
  it("leaves a short single-line description unchanged", () => {
    expect(clipSkillDescription("short and sweet", 100)).toBe("short and sweet");
  });

  it("trims surrounding whitespace and keeps only the first line", () => {
    expect(clipSkillDescription("  first line  \nsecond line", 100)).toBe("first line");
  });

  it("clips to `max` chars total with a trailing ellipsis on overflow", () => {
    const out = clipSkillDescription("a".repeat(50), 10);
    expect(out).toBe("aaaaaaaaa…"); // 9 chars + ellipsis = 10 total
    expect(out.length).toBe(10);
    expect(out.endsWith("…")).toBe(true);
  });

  it("defaults to a 100-char clip (matches trimSkillDesc) when max is unset", () => {
    const long = "b".repeat(200);
    const out = clipSkillDescription(long);
    expect(out.length).toBe(DEFAULT_DESC_MAX_CHARS);
    expect(out).toBe(`${"b".repeat(99)}…`);
  });

  it("treats a non-positive max as the default (never empties the line)", () => {
    const long = "c".repeat(200);
    expect(clipSkillDescription(long, 0).length).toBe(DEFAULT_DESC_MAX_CHARS);
    expect(clipSkillDescription(long, -5).length).toBe(DEFAULT_DESC_MAX_CHARS);
  });
});

describe("applySkillBudget — absent settings = current behavior", () => {
  it("returns all skills with the default clip when settings are undefined", () => {
    const skills = ranked(5, 10);
    const out = applySkillBudget(skills);
    expect(out.map((s) => s.name)).toEqual(skills.map((s) => s.name));
    expect(out).toHaveLength(5);
  });

  it("applies the default 100-char clip to long descriptions when settings are absent", () => {
    const out = applySkillBudget([{ name: "s", description: "d".repeat(200) }]);
    expect(out[0]!.description.length).toBe(DEFAULT_DESC_MAX_CHARS);
  });

  it("treats an empty settings object the same as undefined", () => {
    const skills = ranked(4, 10);
    expect(applySkillBudget(skills, {})).toEqual(applySkillBudget(skills));
  });

  it("does not mutate the input array", () => {
    const skills = ranked(3, 10);
    const before = skills.map((s) => ({ ...s }));
    applySkillBudget(skills, { maxSkills: 1, descriptionMaxChars: 5 });
    expect(skills).toEqual(before);
  });
});

describe("applySkillBudget — maxSkills caps the count keeping the highest-ranked", () => {
  it("keeps the first N in ranked order", () => {
    const out = applySkillBudget(ranked(10), { maxSkills: 3 });
    expect(out.map((s) => s.name)).toEqual(["skill-0", "skill-1", "skill-2"]);
  });

  it("is a no-op when fewer skills than the cap exist", () => {
    expect(applySkillBudget(ranked(2), { maxSkills: 5 })).toHaveLength(2);
  });
});

describe("applySkillBudget — descriptionMaxChars clips each entry", () => {
  it("clips every kept description to the configured width", () => {
    const out = applySkillBudget([{ name: "s", description: "z".repeat(60) }], {
      descriptionMaxChars: 12,
    });
    expect(out[0]!.description.length).toBe(12);
    expect(out[0]!.description.endsWith("…")).toBe(true);
  });
});

describe("applySkillBudget — contextBudgetTokens drops from the tail", () => {
  it("drops lowest-ranked skills until the rendered index fits the budget", () => {
    // Each clipped line: "- skill-N: " + 20 x's. Compute the budget to admit exactly 2.
    const skills = ranked(5, 20);
    const twoFit = indexTokens(skills.slice(0, 2));
    const threeFit = indexTokens(skills.slice(0, 3));
    expect(threeFit).toBeGreaterThan(twoFit); // sanity: dropping changes the cost
    const out = applySkillBudget(skills, { contextBudgetTokens: twoFit });
    expect(out.map((s) => s.name)).toEqual(["skill-0", "skill-1"]);
    expect(indexTokens(out)).toBeLessThanOrEqual(twoFit);
  });

  it("keeps all skills when the budget already fits", () => {
    const skills = ranked(4, 10);
    const out = applySkillBudget(skills, { contextBudgetTokens: indexTokens(skills) + 100 });
    expect(out).toHaveLength(4);
  });

  it("keeps at least one skill when the budget is tinier than a single line", () => {
    const skills = ranked(5, 40);
    const out = applySkillBudget(skills, { contextBudgetTokens: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("skill-0"); // the highest-ranked survivor
  });

  it("returns an empty list when there are no skills (budget is moot)", () => {
    expect(applySkillBudget([], { contextBudgetTokens: 1 })).toEqual([]);
  });

  it("applies maxSkills then clip then budget together", () => {
    // 10 skills, cap to 6, clip wide, then a budget that only fits ~3 of the 6.
    const skills = ranked(10, 30);
    const clippedThree = skills.slice(0, 3).map((s) => ({
      name: s.name,
      description: "q".repeat(8),
    }));
    const budget = indexTokens(clippedThree);
    const out = applySkillBudget(skills, {
      maxSkills: 6,
      descriptionMaxChars: 8,
      contextBudgetTokens: budget,
    });
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.map((s) => s.name)).toEqual(skills.slice(0, out.length).map((s) => s.name));
    expect(indexTokens(out)).toBeLessThanOrEqual(budget);
    for (const s of out) expect(s.description.length).toBeLessThanOrEqual(8);
  });
});

describe("applySkillBudget — line cost mirrors the prompt index shape", () => {
  it("each kept line is estimable as `- name: desc`", () => {
    const out = applySkillBudget(ranked(1, 12), { contextBudgetTokens: 1000 });
    expect(lineTokens(out[0]!)).toBeGreaterThan(0);
  });
});
