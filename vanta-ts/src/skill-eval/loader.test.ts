import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadSkillEvalCorpus, skillSlugsInCorpus, skillsLibraryDir } from "./loader.js";
import { SKILL_EVAL_TASKS } from "./corpus.js";

describe("loadSkillEvalCorpus", () => {
  it("validates and returns all corpus tasks", () => {
    const { tasks } = loadSkillEvalCorpus();
    expect(tasks).toHaveLength(SKILL_EVAL_TASKS.length);
    expect(tasks.length).toBeGreaterThanOrEqual(8);
  });

  it("emits no warnings against the real bundled skills-library (slugs are real)", () => {
    // Guard the cross-check itself: the bundled library must exist for this to mean anything.
    expect(existsSync(skillsLibraryDir)).toBe(true);
    const { warnings } = loadSkillEvalCorpus();
    expect(warnings).toEqual([]);
  });

  it("warns (does not crash) when a referenced slug is missing from the library", () => {
    // Point at a real but unrelated dir so no slug resolves — every task warns,
    // proving a missing slug is a warning, not a throw.
    const { tasks, warnings } = loadSkillEvalCorpus({ libraryDir: skillsLibraryDir + "__nope" });
    expect(tasks.length).toBeGreaterThanOrEqual(8); // still returns tasks
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("skills-library not found");
  });

  it("warns per unknown slug when the library exists but lacks a referenced slug", () => {
    // The skill-eval dir itself exists but contains no <slug>/SKILL.md dirs, so
    // every task's slug is 'missing' there — a deterministic stubbed lister.
    const emptyish = join(skillsLibraryDir, "..", "src", "skill-eval");
    const { warnings } = loadSkillEvalCorpus({ libraryDir: emptyish });
    expect(warnings.length).toBe(SKILL_EVAL_TASKS.length);
    expect(warnings[0]).toMatch(/references unknown skill slug/);
  });
});

describe("skillSlugsInCorpus", () => {
  it("returns the unique set of referenced slugs", () => {
    const slugs = skillSlugsInCorpus();
    expect(new Set(slugs).size).toBe(slugs.length); // deduped
    expect(slugs.length).toBeGreaterThanOrEqual(5);
  });

  it("every referenced slug resolves to a real bundled SKILL.md", () => {
    for (const slug of skillSlugsInCorpus()) {
      expect(existsSync(join(skillsLibraryDir, slug, "SKILL.md"))).toBe(true);
    }
  });
});
