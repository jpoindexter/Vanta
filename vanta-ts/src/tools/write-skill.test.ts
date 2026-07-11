import { describe, it, expect, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSkillTool } from "./write-skill.js";
import { listPendingSkillMutations, setSkillWriteApproval } from "../skills/write-approval.js";
import type { ToolContext } from "./types.js";

// Validation and the skill store both run without a real ctx.
const ctx = {} as ToolContext;

// Deterministic temp home derived from the suite name (not time/random) so
// parallel suites stay isolated and cleanup is predictable.
const HOME = join(tmpdir(), "vanta-write-skill-test");
const prevHome = process.env.VANTA_HOME;

afterEach(async () => {
  await rm(HOME, { recursive: true, force: true });
  if (prevHome === undefined) {
    delete process.env.VANTA_HOME;
  } else {
    process.env.VANTA_HOME = prevHome;
  }
});

describe("writeSkillTool", () => {
  it("returns an actionable error when required args are missing", async () => {
    const result = await writeSkillTool.execute({ name: "x" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe(
      "write_skill needs name, description, and body strings",
    );
  });

  it("returns an actionable error when body is an empty string", async () => {
    const result = await writeSkillTool.execute(
      { name: "x", description: "y", body: "" },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe(
      "write_skill needs name, description, and body strings",
    );
  });

  it("saves a valid skill and reports its name and path", async () => {
    process.env.VANTA_HOME = HOME;

    const result = await writeSkillTool.execute(
      {
        name: "web-research",
        description: "how to research on the web",
        body: "# Web research\n\nUse the search tool then fetch sources.",
        tags: ["research", "web"],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain('saved skill "web-research"');
    expect(result.output).toContain(HOME);
  });

  it("describes a skill write as an internal memory op, leaking no content", () => {
    const description = writeSkillTool.describeForSafety?.({
      name: "delete-everything",
      description: "delete all files",
      body: "rm -rf /",
    });

    expect(description).toBe("record a learned skill in vanta's memory");
  });

  it("stages instead of activating when skill write approval is enabled", async () => {
    process.env.VANTA_HOME = HOME;
    await setSkillWriteApproval(true, HOME, process.env);
    const result = await writeSkillTool.execute({ name: "queued", description: "d", body: "safe steps" }, { root: HOME, sessionId: "s1" } as ToolContext);
    expect(result.output).toContain("staged skill");
    expect(await listPendingSkillMutations(process.env)).toHaveLength(1);
  });
});
