import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runApiCommand } from "./api-cmd.js";

let home: string;
const originalHome = process.env.VANTA_HOME;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-api-cli-")); process.env.VANTA_HOME = home; });
afterEach(async () => {
  if (originalHome === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = originalHome;
  await rm(home, { recursive: true, force: true });
});

describe("vanta api token", () => {
  it("creates, lists, and revokes a token without printing it twice", async () => {
    const lines: string[] = [];
    expect(await runApiCommand("/repo", ["token", "create", "Build", "bot"], (line) => lines.push(line))).toBe(0);
    const token = lines.find((line) => line.startsWith("token "))?.slice(6);
    const id = lines[0]?.split(" ")[1];
    expect(token).toMatch(/^vta_/);
    lines.length = 0;
    expect(await runApiCommand("/repo", ["token", "list"], (line) => lines.push(line))).toBe(0);
    expect(lines.join("\n")).toContain("Build bot");
    expect(lines.join("\n")).not.toContain(token);
    expect(await runApiCommand("/repo", ["token", "revoke", String(id)], (line) => lines.push(line))).toBe(0);
  });
});
