import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillsRegistryCommand } from "./skills-registry-cmd.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("multi-source skills CLI", () => {
  it("searches, inspects, installs through quarantine, and manages taps", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-hub-cli-"));
    const env = { VANTA_HOME: join(root, "home") }, lines: string[] = [];
    const content = "---\nname: useful\ndescription: Useful package\n---\n# Useful\n";
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://docs.example/.well-known/skills/index.json") return ok({ skills: [{ name: "useful", description: "Useful package", files: ["SKILL.md", "references/api.md"] }] });
      if (url === "https://docs.example/.well-known/skills/useful/SKILL.md") return ok(content);
      if (url === "https://docs.example/.well-known/skills/useful/references/api.md") return ok("# API\n");
      return new Response("missing", { status: 404 });
    };
    const deps = { env, fetcher, log: (line: string) => lines.push(line) };
    expect(await runSkillsRegistryCommand(["search", "https://docs.example", "--source", "well-known"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("well-known:https://docs.example/.well-known/skills/useful");
    expect(await runSkillsRegistryCommand(["inspect", "well-known:https://docs.example/.well-known/skills/useful"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("references/api.md");
    expect(await runSkillsRegistryCommand(["install", "well-known:https://docs.example/.well-known/skills/useful", "--yes"], deps)).toBe(0);
    expect(await readFile(join(env.VANTA_HOME, "skill-registry-quarantine/useful/references/api.md"), "utf8")).toBe("# API\n");
    expect(await runSkillsRegistryCommand(["tap", "add", "acme/skills", "skills"], deps)).toBe(0);
    expect(await runSkillsRegistryCommand(["tap", "list"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("acme/skills\tskills");
    expect(await runSkillsRegistryCommand(["tap", "remove", "acme/skills", "skills"], deps)).toBe(0);
  });
});

function ok(value: unknown): Response {
  return new Response(typeof value === "string" ? value : JSON.stringify(value), { status: 200 });
}
