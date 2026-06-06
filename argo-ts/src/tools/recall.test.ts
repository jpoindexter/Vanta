import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recallTool } from "./recall.js";
import { skillsDir, slugifySkillName } from "../store/home.js";
import type { ToolContext } from "./types.js";

// Deterministic temp home derived from the suite name, not time/randomness.
const VANTA_HOME = join(tmpdir(), "argo-recall-test-store");
const SKILL_NAME = "web-research";
const SKILL_DESC = "How to research a topic with web search and verify sources.";

const ctx = {} as ToolContext; // recall.execute ignores ctx — reads VANTA_HOME via env.

async function writeSkill(): Promise<void> {
  const dir = join(skillsDir(), slugifySkillName(SKILL_NAME));
  await mkdir(dir, { recursive: true });
  const md = [
    "---",
    `name: ${SKILL_NAME}`,
    `description: ${SKILL_DESC}`,
    "created: 2026-06-02T10:00:00.000Z",
    "updated: 2026-06-02T10:00:00.000Z",
    "tags: [research, web]",
    "---",
    "Use search, then fetch and cross-check each claim.",
    "",
  ].join("\n");
  await writeFile(join(dir, "SKILL.md"), md, "utf8");
}

describe("recallTool", () => {
  beforeEach(() => {
    process.env.VANTA_HOME = VANTA_HOME;
  });

  afterEach(async () => {
    delete process.env.VANTA_HOME;
    await rm(VANTA_HOME, { recursive: true, force: true });
  });

  it("returns ok:false when query is empty", async () => {
    const res = await recallTool.execute({ query: "" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("query");
  });

  it("returns ok:false when query is missing", async () => {
    const res = await recallTool.execute({}, ctx);
    expect(res.ok).toBe(false);
  });

  it("returns the matching skill name AND its full body for a relevant query", async () => {
    await writeSkill();
    const res = await recallTool.execute({ query: "web research" }, ctx);
    expect(res.ok).toBe(true);
    expect(res.output).toContain(SKILL_NAME);
    // The body is now loaded on demand, not just the index line.
    expect(res.output).toContain("Use search, then fetch and cross-check each claim.");
  });

  it("returns the no-match message for an unrelated query", async () => {
    await writeSkill();
    const res = await recallTool.execute(
      { query: "zzzqqq unrelated nonsense xyzzy" },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.output).toBe("(no matching skills)");
  });

  it("never leaks the raw query in describeForSafety", () => {
    const label = recallTool.describeForSafety?.({ query: "rm -rf danger" });
    expect(label).toBe("search argo's skill library");
  });
});
