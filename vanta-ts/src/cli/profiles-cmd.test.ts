import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProfilesCommand } from "./profiles-cmd.js";

let home: string;
let env: NodeJS.ProcessEnv;
let lines: string[];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-profiles-cli-"));
  env = { VANTA_HOME: home };
  lines = [];
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const run = (args: string[]) => runProfilesCommand(args, { env, log: (line) => lines.push(line) });

describe("vanta profiles", () => {
  it("creates, lists, targets, clones, switches, inspects, and archives profiles", async () => {
    expect(await run(["create", "Research Lead", "--provider", "codex", "--model", "gpt-5.5", "--tools", "read_file,web_search"])).toBe(0);
    expect(lines.at(-1)).toContain("created research-lead");

    lines = [];
    expect(await run(["tools", "research-lead", "--allow", "read_file,grep_files"])).toBe(0);
    expect(lines.at(-1)).toContain("read_file");

    lines = [];
    expect(await run(["target", "research-lead", "Audit provider fallback"])).toBe(0);
    expect(lines.at(-1)).toContain("queued for research-lead");

    lines = [];
    expect(await run(["clone", "research-lead", "Research Backup"])).toBe(0);
    expect(lines.at(-1)).toContain("cloned research-lead -> research-backup");

    lines = [];
    expect(await run(["switch", "research-backup"])).toBe(0);
    expect(lines.at(-1)).toContain("active on next Vanta start");

    lines = [];
    expect(await run(["list"])).toBe(0);
    expect(lines.join("\n")).toContain("research-lead");
    expect(lines.join("\n")).toContain("research-backup · active");

    lines = [];
    expect(await run(["inbox", "research-lead"])).toBe(0);
    expect(lines.join("\n")).toContain("Audit provider fallback");

    lines = [];
    expect(await run(["archive", "research-lead"])).toBe(0);
    expect(lines.at(-1)).toContain("archived research-lead");
  });

  it("returns actionable usage for invalid commands", async () => {
    expect(await run(["target", "missing"])).toBe(1);
    expect(lines.join("\n")).toContain("Usage: vanta profiles");
  });
});
