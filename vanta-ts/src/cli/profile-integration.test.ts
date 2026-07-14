import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const TEST_TIMEOUT_MS = 120_000;
let root: string;
let home: string;
let source: string;

async function cli(...args: string[]): Promise<string> {
  const result = await exec(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(), env: { ...process.env, VANTA_HOME: home }, timeout: 30_000,
  });
  expect(result.stderr).toBe("");
  return result.stdout;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-profile-live-"));
  home = join(root, "home");
  source = join(root, "source");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "vanta-profile.json"), JSON.stringify({ version: 1, name: "Writer", soul: "SOUL.md" }));
  await writeFile(join(source, "SOUL.md"), "Write clearly.\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("vanta profile distribution dispatch", () => {
  it("previews, installs, previews an update, and applies it through the real CLI", async () => {
    expect(await cli("profile", "install", source)).toContain("rerun with --apply to install");
    expect(await cli("profile", "install", source, "--apply")).toContain("installed writer");
    await writeFile(join(source, "SOUL.md"), "Write with evidence.\n");
    expect(await cli("profile", "update", "writer")).toContain("changed 1: SOUL.md");
    expect(await cli("profile", "update", "writer", "--apply")).toContain("updated writer · backup");
  }, TEST_TIMEOUT_MS);
});
