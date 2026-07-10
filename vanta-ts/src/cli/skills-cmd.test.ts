import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillCommand, runSkillsCommand } from "./skills-cmd.js";
import { writeBundle } from "../skills/bundle.js";
import { writeSkill } from "../skills/store.js";

describe("skills command bundles", () => {
  const oldHome = process.env.VANTA_HOME;
  afterEach(() => {
    if (oldHome === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = oldHome;
    vi.restoreAllMocks();
  });

  async function seed(): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), "vanta-skills-cmd-"));
    process.env.VANTA_HOME = home;
    await writeSkill({ name: "tdd-cycle", description: "d", body: "write failing test" }, { env: process.env, now: "2026-01-01T00:00:00.000Z" });
    await writeSkill({ name: "code-review", description: "d", body: "review the diff" }, { env: process.env, now: "2026-01-01T00:00:00.000Z" });
    await writeBundle({ name: "dev-workflow", description: "Dev bundle", skills: ["tdd-cycle", "code-review"], instruction: "Apply both." }, process.env);
    return home;
  }

  it("prints a bundle through vanta skill <bundle>", async () => {
    const home = await seed();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runSkillCommand("/repo", ["dev-workflow"]);
      expect(log.mock.calls.join("\n")).toContain("# Bundle: dev-workflow");
      expect(log.mock.calls.join("\n")).toContain("## Skill: code-review");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("shows missing bundle skills in vanta skills bundle <name>", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-skills-cmd-"));
    process.env.VANTA_HOME = home;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await writeBundle({ name: "broken", description: "Broken", skills: ["missing"] }, process.env);
      await runSkillsCommand(["bundle", "broken"]);
      expect(log.mock.calls.join("\n")).toContain("Missing: missing");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
