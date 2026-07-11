import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillsRegistryCommand } from "./skills-registry-cmd.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("vanta skills registry commands", () => {
  it("runs browse through doctor and keeps values actionable", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-skill-registry-cli-"));
    const home = join(root, "home"), registry = join(root, "registry"), content = "# Useful\nDo work.\n";
    await mkdir(join(registry, "useful"), { recursive: true });
    await writeFile(join(registry, "useful", "SKILL.md"), content);
    await writeFile(join(registry, "index.json"), JSON.stringify({ version: 1, skills: [{
      slug: "useful", name: "Useful", version: "1.0.0", description: "Useful skill", source: "useful/SKILL.md",
      sha256: createHash("sha256").update(content).digest("hex"), capabilities: ["read files"],
    }] }));
    const lines: string[] = [], deps = { env: { VANTA_HOME: home, VANTA_SKILL_REGISTRY: join(registry, "index.json") }, log: (line: string) => lines.push(line) };
    expect(await runSkillsRegistryCommand(["browse"], deps)).toBe(0);
    expect(await runSkillsRegistryCommand(["view", "useful"], deps)).toBe(0);
    expect(await runSkillsRegistryCommand(["install", "useful"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("Complete SKILL.md");
    expect(lines.join("\n")).toContain("package files:");
    expect(lines.join("\n")).toContain("SKILL.md");
    expect(lines.join("\n")).toContain("risks: none detected");
    expect(lines.join("\n")).toContain("rerun with --yes");
    expect(await runSkillsRegistryCommand(["install", "useful", "--yes"], deps)).toBe(0);
    expect(await runSkillsRegistryCommand(["approve", "useful", "--yes"], deps)).toBe(0);
    expect(await runSkillsRegistryCommand(["doctor"], deps)).toBe(0);
    expect(await runSkillsRegistryCommand(["remove", "useful", "--yes"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("useful\tok");
  });
});
