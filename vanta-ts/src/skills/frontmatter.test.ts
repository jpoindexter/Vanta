import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterAll } from "vitest";
import { parseSkill, serializeSkill, expandSkillArgs, expandAtImports } from "./frontmatter.js";
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

  it("round-trips a skill with triggers (SKILL-TRIGGERS) as single-line JSON", () => {
    const skill: Skill = {
      meta: {
        name: "ship-preflight",
        description: "run the suite before a push",
        created: "2026-06-02T10:00:00.000Z",
        updated: "2026-06-02T10:00:00.000Z",
        tags: ["ship"],
        triggers: [{ event: "PreToolUse", match: "git_push" }, { event: "Stop", when: "errors>=3" }],
      },
      body: "# Preflight\n\nRun typecheck + tests.",
    };
    const out = serializeSkill(skill);
    expect(out).toContain('triggers: [{"event":"PreToolUse"');
    expect(out.split("triggers:")[1]!.split("\n")[0]).toBeTruthy(); // single line
    expect(parseSkill(out)).toEqual(skill);
  });

  it("drops malformed triggers JSON without breaking other keys", () => {
    const md = "---\nname: x\ndescription: d\ncreated: c\nupdated: u\ntags: [a]\ntriggers: not json\n---\n\nbody";
    const parsed = parseSkill(md);
    expect(parsed.meta.triggers).toEqual([]);
    expect(parsed.meta.tags).toEqual(["a"]); // other keys still parse
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

describe("expandSkillArgs", () => {
  it("replaces $ARGUMENTS with the provided args string", () => {
    expect(expandSkillArgs("Run $ARGUMENTS now.", "the task")).toBe("Run the task now.");
  });

  it("leaves \\$ARGUMENTS as a literal $ARGUMENTS (escape consumed)", () => {
    expect(expandSkillArgs("Use \\$ARGUMENTS literally.", "irrelevant")).toBe(
      "Use $ARGUMENTS literally.",
    );
  });

  it("is a no-op when body has no $ARGUMENTS", () => {
    expect(expandSkillArgs("No placeholder here.", "args")).toBe("No placeholder here.");
  });

  it("does not mangle an args string that itself contains $ARGUMENTS", () => {
    // Single-pass: the replacement value is never re-scanned.
    expect(expandSkillArgs("Do: $ARGUMENTS", "$ARGUMENTS")).toBe("Do: $ARGUMENTS");
  });
});

describe("expandAtImports", () => {
  let tmpDir: string;

  afterAll(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("replaces an @file line with the file's contents", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vanta-test-"));
    await writeFile(join(tmpDir, "import.md"), "imported content", "utf8");
    const result = await expandAtImports("before\n@import.md\nafter", tmpDir);
    expect(result).toBe("before\nimported content\nafter");
  });

  it("leaves an @file line unchanged when the file is unreadable", async () => {
    tmpDir ??= await mkdtemp(join(tmpdir(), "vanta-test-"));
    const result = await expandAtImports("@nonexistent.md", tmpDir);
    expect(result).toBe("@nonexistent.md");
  });

  it("is a no-op on a body with no @-import lines", async () => {
    tmpDir ??= await mkdtemp(join(tmpdir(), "vanta-test-"));
    const body = "no imports here\njust text";
    expect(await expandAtImports(body, tmpDir)).toBe(body);
  });
});
