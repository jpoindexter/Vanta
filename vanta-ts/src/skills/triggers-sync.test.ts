import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeSkill } from "./frontmatter.js";
import { syncSkillTriggers } from "./triggers-sync.js";
import type { Skill } from "./types.js";

const skill: Skill = {
  meta: {
    name: "ship-preflight",
    description: "run the suite before a push",
    created: "2026-06-02T10:00:00.000Z",
    updated: "2026-06-02T10:00:00.000Z",
    tags: ["ship"],
    triggers: [{ event: "PreToolUse", match: "git_push" }, { event: "Stop" }],
  },
  body: "# Preflight\n\nRun typecheck + tests.",
};

describe("syncSkillTriggers", () => {
  let home: string;
  const env = (): NodeJS.ProcessEnv => ({ ...process.env, VANTA_HOME: home }) as NodeJS.ProcessEnv;
  const hooksPath = (): string => join(home, "hooks.json");

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "trig-sync-"));
    const dir = join(home, "skills", "ship-preflight");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), serializeSkill(skill), "utf8");
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("compiles the skill's triggers into ~/.vanta/hooks.json", async () => {
    const r = await syncSkillTriggers({ env: env() });
    expect(r.written).toBe(2);
    const cfg = JSON.parse(await readFile(hooksPath(), "utf8"));
    expect(cfg.PreToolUse[0].command).toContain("skills trigger-emit ship-preflight PreToolUse");
    expect(cfg.PreToolUse[0].toolNamePattern).toBe("git_push");
    expect(cfg.Stop[0].command).toContain("skills trigger-emit ship-preflight Stop");
  });

  it("is idempotent — two syncs produce identical hooks.json", async () => {
    await syncSkillTriggers({ env: env() });
    const first = await readFile(hooksPath(), "utf8");
    await syncSkillTriggers({ env: env() });
    expect(await readFile(hooksPath(), "utf8")).toBe(first);
  });

  it("preserves a hand-written hook (namespaced replacement)", async () => {
    await writeFile(hooksPath(), JSON.stringify({ Stop: [{ type: "command", command: "echo handwritten" }] }), "utf8");
    await syncSkillTriggers({ env: env() });
    const cfg = JSON.parse(await readFile(hooksPath(), "utf8"));
    expect(cfg.Stop).toHaveLength(2); // hand-written + generated
    expect(cfg.Stop.some((h: { command: string }) => h.command === "echo handwritten")).toBe(true);
  });
});
