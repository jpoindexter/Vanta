import { describe, it, expect } from "vitest";
import { planSkillReload, formatSkillReload, runReloadSkills } from "./reload-skills-cmd.js";

describe("planSkillReload", () => {
  it("routes on-disk-not-indexed skills into added", () => {
    const plan = planSkillReload(["a", "b", "c"], ["a"]);
    expect(plan.added).toEqual(["b", "c"]);
    expect(plan.removed).toEqual([]);
    expect(plan.unchanged).toEqual(["a"]);
  });

  it("routes indexed-not-on-disk skills into removed", () => {
    const plan = planSkillReload(["a"], ["a", "x", "y"]);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual(["x", "y"]);
    expect(plan.unchanged).toEqual(["a"]);
  });

  it("routes the intersection into unchanged", () => {
    const plan = planSkillReload(["a", "b"], ["a", "b"]);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.unchanged).toEqual(["a", "b"]);
  });

  it("reports added and removed together", () => {
    const plan = planSkillReload(["a", "new"], ["a", "gone"]);
    expect(plan.added).toEqual(["new"]);
    expect(plan.removed).toEqual(["gone"]);
    expect(plan.unchanged).toEqual(["a"]);
  });

  it("nothing changed → empty added + removed, all unchanged", () => {
    const plan = planSkillReload(["a", "b"], ["b", "a"]);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.unchanged).toEqual(["a", "b"]);
  });

  it("preserves on-disk order in added + unchanged, indexed order in removed", () => {
    const plan = planSkillReload(["z", "m", "a"], ["m", "q", "p"]);
    expect(plan.added).toEqual(["z", "a"]);
    expect(plan.removed).toEqual(["q", "p"]);
    expect(plan.unchanged).toEqual(["m"]);
  });

  it("dedupes repeated names in on-disk and indexed", () => {
    const plan = planSkillReload(["a", "a", "b", "b"], ["b", "b"]);
    expect(plan.added).toEqual(["a"]);
    expect(plan.removed).toEqual([]);
    expect(plan.unchanged).toEqual(["b"]);
  });

  it("drops empty-string names", () => {
    const plan = planSkillReload(["", "a"], [""]);
    expect(plan.added).toEqual(["a"]);
    expect(plan.removed).toEqual([]);
    expect(plan.unchanged).toEqual([]);
  });

  it("is idempotent — a second plan with the new set indexed reports nothing new", () => {
    const first = planSkillReload(["a", "b"], ["a"]);
    expect(first.added).toEqual(["b"]);
    const second = planSkillReload(["a", "b"], ["a", "b"]);
    expect(second.added).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.unchanged).toEqual(["a", "b"]);
  });
});

describe("formatSkillReload", () => {
  it("summarizes newly-available skills with names + removed/unchanged counts", () => {
    expect(formatSkillReload({ added: ["b", "c"], removed: ["x"], unchanged: ["a"] }))
      .toBe("  ↻ 2 new skill(s): b, c · 1 removed · 1 unchanged");
  });

  it("reports removals even with no additions", () => {
    expect(formatSkillReload({ added: [], removed: ["x", "y"], unchanged: ["a"] }))
      .toBe("  ↻ 0 new skill(s) · 2 removed · 1 unchanged");
  });

  it("reports no skill changes with the unchanged count", () => {
    expect(formatSkillReload({ added: [], removed: [], unchanged: ["a", "b"] }))
      .toBe("  no skill changes (2 skills)");
  });

  it("reports no skill changes with zero skills", () => {
    expect(formatSkillReload({ added: [], removed: [], unchanged: [] }))
      .toBe("  no skill changes (0 skills)");
  });
});

describe("runReloadSkills", () => {
  it("re-indexes the changed set and returns the summary", async () => {
    const seen: Array<{ added: string[]; removed: string[] }> = [];
    const result = await runReloadSkills({
      readOnDisk: () => ["a", "b", "c"],
      readIndexed: () => ["a"],
      reindex: (plan) => {
        seen.push({ added: [...plan.added], removed: [...plan.removed] });
      },
    });
    expect(seen).toEqual([{ added: ["b", "c"], removed: [] }]);
    expect(result.output).toBe("  ↻ 2 new skill(s): b, c · 0 removed · 1 unchanged");
  });

  it("does not call the re-index when nothing changed", async () => {
    let called = false;
    const result = await runReloadSkills({
      readOnDisk: () => ["a"],
      readIndexed: () => ["a"],
      reindex: () => {
        called = true;
      },
    });
    expect(called).toBe(false);
    expect(result.output).toBe("  no skill changes (1 skills)");
  });

  it("re-indexes when only removals occurred", async () => {
    let called = false;
    const result = await runReloadSkills({
      readOnDisk: () => ["a"],
      readIndexed: () => ["a", "gone"],
      reindex: () => {
        called = true;
      },
    });
    expect(called).toBe(true);
    expect(result.output).toBe("  ↻ 0 new skill(s) · 1 removed · 1 unchanged");
  });

  it("reports the plan even without a re-index wired", async () => {
    const result = await runReloadSkills({
      readOnDisk: async () => ["a", "b"],
      readIndexed: async () => ["a"],
    });
    expect(result.output).toBe("  ↻ 1 new skill(s): b · 0 removed · 1 unchanged");
  });

  it("awaits async readers", async () => {
    const result = await runReloadSkills({
      readOnDisk: async () => Promise.resolve(["x"]),
      readIndexed: async () => Promise.resolve([]),
    });
    expect(result.output).toBe("  ↻ 1 new skill(s): x · 0 removed · 0 unchanged");
  });
});
