import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintSkills, formatLint } from "./lint.js";

const VANTA_HOME = join(tmpdir(), "vanta-skills-lint-test");
const env = { ...process.env, VANTA_HOME };
const skillsRoot = join(VANTA_HOME, "skills");

async function writeSkill(dir: string, frontmatter: string, body = "do the thing") {
  await mkdir(join(skillsRoot, dir), { recursive: true });
  await writeFile(join(skillsRoot, dir, "SKILL.md"), `---\n${frontmatter}\n---\n${body}\n`, "utf8");
}

describe("lintSkills", () => {
  beforeEach(async () => { await rm(VANTA_HOME, { recursive: true, force: true }); });
  afterEach(async () => { await rm(VANTA_HOME, { recursive: true, force: true }); });

  it("passes a well-formed skill", async () => {
    await writeSkill("web-research", "name: web-research\ndescription: research the web\ncreated: 2026-06-01T00:00:00.000Z\nupdated: 2026-06-01T00:00:00.000Z\ntags: [web]");
    const issues = await lintSkills(env);
    expect(issues).toEqual([]);
    expect(formatLint(issues)).toContain("all skills valid");
  });

  it("flags name↔directory drift and a missing description", async () => {
    await writeSkill("wrong-dir", "name: actual-name\ndescription: \ncreated: 2026-06-01T00:00:00.000Z\nupdated: 2026-06-01T00:00:00.000Z\ntags: []");
    const issues = await lintSkills(env);
    expect(issues.some((i) => i.message.includes("≠ directory"))).toBe(true);
    expect(issues.some((i) => i.level === "error" && i.message.includes("description"))).toBe(true);
  });
});
