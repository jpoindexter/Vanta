import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProfileCommand } from "./profile-cmd.js";

let root: string;
let home: string;
let source: string;
let lines: string[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-profile-cli-"));
  home = join(root, "home");
  source = join(root, "source");
  lines = [];
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "vanta-profile.json"), JSON.stringify({ version: 1, name: "Writer", soul: "SOUL.md" }));
  await writeFile(join(source, "SOUL.md"), "Write clearly.\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const run = (args: string[]) => runProfileCommand(args, { env: { VANTA_HOME: home }, log: (line) => lines.push(line) });

describe("vanta profile", () => {
  it("previews before apply and then installs", async () => {
    expect(await run(["install", source])).toBe(0);
    expect(lines.join("\n")).toContain("preview writer");
    expect(lines.join("\n")).toContain("rerun with --apply");
    lines = [];
    expect(await run(["install", source, "--apply"])).toBe(0);
    expect(lines.join("\n")).toContain("installed writer");
  });

  it("prints actionable usage when the source is missing", async () => {
    expect(await run(["install"])).toBe(1);
    expect(lines.join("\n")).toContain("Usage: vanta profile");
  });
});
