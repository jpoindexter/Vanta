import { describe, expect, it } from "vitest";
import { searchSkills } from "./recall.js";
import type { Skill } from "./types.js";

const FIXED_NOW = "2026-06-02T10:00:00.000Z";

function makeSkill(overrides: Partial<Skill["meta"]> & { body?: string }): Skill {
  const { body = "", ...meta } = overrides;
  return {
    meta: {
      name: "skill",
      description: "",
      created: FIXED_NOW,
      updated: FIXED_NOW,
      tags: [],
      ...meta,
    },
    body,
  };
}

describe("searchSkills", () => {
  it("ranks a name match above a body-only match", () => {
    const nameMatch = makeSkill({ name: "web-research" });
    const bodyMatch = makeSkill({ name: "note-taking", body: "research notes" });

    const results = searchSkills("research", [bodyMatch, nameMatch]);

    expect(results.map((r) => r.skill.meta.name)).toEqual([
      "web-research",
      "note-taking",
    ]);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("excludes skills with zero matching tokens", () => {
    const hit = makeSkill({ name: "research" });
    const miss = makeSkill({ name: "cooking", description: "recipes" });

    const results = searchSkills("research", [hit, miss]);

    expect(results).toHaveLength(1);
    expect(results[0]!.skill.meta.name).toBe("research");
  });

  it("breaks score ties by name ascending for deterministic ordering", () => {
    const beta = makeSkill({ name: "beta", description: "research" });
    const alpha = makeSkill({ name: "alpha", description: "research" });

    const results = searchSkills("research", [beta, alpha]);

    expect(results[0]!.score).toBe(results[1]!.score);
    expect(results.map((r) => r.skill.meta.name)).toEqual(["alpha", "beta"]);
  });

  it("accumulates field weights: name 3 + description 2 + tags 2 + body 1", () => {
    const skill = makeSkill({
      name: "research",
      description: "research helper",
      tags: ["research"],
      body: "research body",
    });

    const results = searchSkills("research", [skill]);

    expect(results[0]!.score).toBe(8);
  });

  it("drops tokens shorter than 2 chars and matches each remaining token per field", () => {
    const skill = makeSkill({ name: "ab tool", body: "ab body" });

    // "a" is dropped (too short); "ab" matches name (3) + body (1).
    const results = searchSkills("a ab", [skill]);

    expect(results[0]!.score).toBe(4);
  });

  it("returns no matches for an empty or all-short query", () => {
    const skill = makeSkill({ name: "research" });

    expect(searchSkills("", [skill])).toEqual([]);
    expect(searchSkills("a !", [skill])).toEqual([]);
  });

  it("matches case-insensitively and counts each field at most once per token", () => {
    const skill = makeSkill({ name: "ReSeArCh ReSeArCh" });

    // Repeated occurrence in the same field still scores the field weight once.
    const results = searchSkills("RESEARCH", [skill]);

    expect(results[0]!.score).toBe(3);
  });
});
