import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAuthPoolCommand } from "./auth-pool-cmd.js";

let home = "";
afterEach(async () => { if (home) await rm(home, { recursive: true, force: true }); });

describe("vanta auth pool", () => {
  it("adds, lists, resolves, and removes redacted credential references", async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-auth-pool-"));
    const env = { VANTA_HOME: home, OPENAI_SECONDARY: "secret-value" }, lines: string[] = [];
    const deps = { env, log: (line: string) => lines.push(line), now: () => new Date("2026-07-11T12:00:00Z") };
    expect(await runAuthPoolCommand(["add", "openai", "secondary", "--source", "env", "--ref", "OPENAI_SECONDARY"], deps)).toBe(0);
    expect(await runAuthPoolCommand(["list"], deps)).toBe(0);
    expect(await runAuthPoolCommand(["test", "openai", "secondary"], deps)).toBe(0);
    expect(lines.join("\n")).toContain("openai/secondary");
    expect(lines.join("\n")).toContain("resolved (value redacted)");
    expect(lines.join("\n")).not.toContain("secret-value");
    expect(await runAuthPoolCommand(["remove", "openai", "secondary"], deps)).toBe(0);
  });
});
