import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAutoModeCommand } from "./auto-mode-cmd.js";

let root: string;
let home: string;
let env: NodeJS.ProcessEnv;
let logs: string[];

async function run(rest: string[]): Promise<number> {
  return runAutoModeCommand(root, rest, { env, log: (line) => logs.push(line) });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-auto-mode-root-"));
  home = await mkdtemp(join(tmpdir(), "vanta-auto-mode-home-"));
  env = { VANTA_HOME: home };
  logs = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe("runAutoModeCommand", () => {
  it("prints built-in defaults", async () => {
    expect(await run(["defaults"])).toBe(0);
    const out = logs.join("\n");
    expect(out).toContain("auto-mode defaults");
    expect(out).toContain("soft_deny");
  });

  it("prints effective config with settings overrides", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "settings.json"), JSON.stringify({
      autoMode: { enabled: true, rules: [{ action: "allow", tool: "shell_cmd", pattern: "git status" }] },
    }));
    expect(await run(["config"])).toBe(0);
    const out = logs.join("\n");
    expect(out).toContain("enabled yes");
    expect(out).toContain("git status");
  });

  it("returns usage for unknown subcommands", async () => {
    expect(await run(["wat"])).toBe(1);
    expect(logs.join("\n")).toContain("usage: vanta auto-mode");
  });
});
