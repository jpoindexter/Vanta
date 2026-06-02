import { describe, expect, it } from "vitest";
import { parseSkill, serializeSkill } from "./frontmatter.js";
import type { Skill } from "./types.js";

describe("frontmatter", () => {
  it("round-trips a skill with tags through serialize then parse", () => {
    const skill: Skill = {
      meta: {
        name: "web-research",
        description: "search the web and summarize",
        created: "2026-06-02T10:00:00.000Z",
        updated: "2026-06-02T11:30:00.000Z",
        tags: ["research", "web"],
      },
      body: "# Web research\n\nUse the search tool, then synthesize.",
    };

    expect(parseSkill(serializeSkill(skill))).toEqual(skill);
  });

  it("preserves ISO timestamps that contain colons", () => {
    const skill: Skill = {
      meta: {
        name: "x",
        description: "y",
        created: "2026-06-02T10:00:00.000Z",
        updated: "2026-06-02T10:00:00.000Z",
        tags: [],
      },
      body: "body",
    };

    const parsed = parseSkill(serializeSkill(skill));
    expect(parsed.meta.created).toBe("2026-06-02T10:00:00.000Z");
    expect(parsed.meta.updated).toBe("2026-06-02T10:00:00.000Z");
  });

  it("round-trips a skill with empty tags as an empty array", () => {
    const skill: Skill = {
      meta: {
        name: "n",
        description: "d",
        created: "2026-06-02T10:00:00.000Z",
        updated: "2026-06-02T10:00:00.000Z",
        tags: [],
      },
      body: "the body",
    };

    expect(parseSkill(serializeSkill(skill)).meta.tags).toEqual([]);
  });

  it("parses bare-comma tags into a trimmed list", () => {
    const md = [
      "---",
      "name: bare",
      "description: bare tag form",
      "created: 2026-06-02T10:00:00.000Z",
      "updated: 2026-06-02T10:00:00.000Z",
      "tags: research, web, agents",
      "---",
      "",
      "body text",
    ].join("\n");

    expect(parseSkill(md).meta.tags).toEqual(["research", "web", "agents"]);
  });

  it("drops empty segments from trailing-comma tags", () => {
    const md = [
      "---",
      "name: trail",
      "description: d",
      "created: ",
      "updated: ",
      "tags: [a, b, ]",
      "---",
      "",
      "body",
    ].join("\n");

    expect(parseSkill(md).meta.tags).toEqual(["a", "b"]);
  });

  it("treats a doc with no frontmatter as body only with empty meta", () => {
    const md = "# Just a body\n\nNo frontmatter here.";
    const result = parseSkill(md);

    expect(result.body).toBe("# Just a body\n\nNo frontmatter here.");
    expect(result.meta).toEqual({
      name: "",
      description: "",
      created: "",
      updated: "",
      tags: [],
    });
  });

  it("does not false-match a lone markdown rule as frontmatter", () => {
    // Opening fence with no closing fence => the whole string is the body.
    const md = "---\nnot frontmatter, no closing fence";
    const result = parseSkill(md);

    expect(result.meta.name).toBe("");
    expect(result.body).toBe("---\nnot frontmatter, no closing fence");
  });

  it("defaults missing name and description to empty strings", () => {
    const md = [
      "---",
      "created: 2026-06-02T10:00:00.000Z",
      "updated: 2026-06-02T10:00:00.000Z",
      "tags: [t]",
      "---",
      "",
      "body",
    ].join("\n");
    const meta = parseSkill(md).meta;

    expect(meta.name).toBe("");
    expect(meta.description).toBe("");
  });

  it("emits the exact frontmatter shape: fenced block, blank line, body", () => {
    const skill: Skill = {
      meta: {
        name: "shape",
        description: "check output",
        created: "2026-06-02T10:00:00.000Z",
        updated: "2026-06-02T10:00:00.000Z",
        tags: ["a", "b"],
      },
      body: "body line",
    };

    expect(serializeSkill(skill)).toBe(
      [
        "---",
        "name: shape",
        "description: check output",
        "created: 2026-06-02T10:00:00.000Z",
        "updated: 2026-06-02T10:00:00.000Z",
        "tags: [a, b]",
        "---",
        "",
        "body line",
      ].join("\n"),
    );
  });
});
