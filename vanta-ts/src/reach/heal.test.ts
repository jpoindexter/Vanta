import { describe, it, expect } from "vitest";
import { tryUpgrade, pyToolUpgradeCommands } from "./heal.js";

describe("pyToolUpgradeCommands", () => {
  it("builds an ordered uv ▸ pipx ▸ pip ladder for a package", () => {
    const cmds = pyToolUpgradeCommands("twitter-cli");
    expect(cmds[0]).toEqual(["uv", ["tool", "install", "--upgrade", "twitter-cli"]]);
    expect(cmds.map((c) => c[0])).toEqual(["uv", "pipx", "pipx", "pip3"]);
    expect(cmds.every((c) => c[1].includes("twitter-cli"))).toBe(true);
  });
});

describe("tryUpgrade", () => {
  it("returns ok with the command it ran on first success", async () => {
    // `true` exits 0 on any POSIX shell — stands in for a working installer.
    const r = await tryUpgrade([["true", []]]);
    expect(r.ok).toBe(true);
    expect(r.ran).toBe("true ");
  });

  it("skips missing installers (ENOENT) and tries the next", async () => {
    const r = await tryUpgrade([["definitely-not-a-real-bin-xyz", ["x"]], ["true", []]]);
    expect(r.ok).toBe(true);
    expect(r.ran).toBe("true ");
  });

  it("fails cleanly when every command is unavailable, never throws", async () => {
    const r = await tryUpgrade([["definitely-not-a-real-bin-xyz", ["x"]]]);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("not available");
  });

  it("records a real failure (non-zero exit) and degrades", async () => {
    // `false` exits 1 — a command that ran but failed.
    const r = await tryUpgrade([["false", []]]);
    expect(r.ok).toBe(false);
  });
});
