import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { claudeSpec } from "./claude-code.js";
import { codexSpec } from "./codex.js";
import { hermesSpec } from "./hermes.js";
import { detectCli, isOnPath, parseVersion, type ProbeFn } from "./probe.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const recorded = (name: string): string => readFileSync(join(dir, name), "utf8");
const env = { PATH: "/usr/bin:/bin" } as NodeJS.ProcessEnv;
const here = process.execPath; // an absolute path that exists, so isOnPath passes without PATH setup

describe("parseVersion", () => {
  it("reads the version from each recorded --version output", () => {
    expect(parseVersion(recorded("version-claude.txt"))).toBe("2.1.222");
    expect(parseVersion(recorded("version-codex.txt"))).toBe("0.144.1");
    expect(parseVersion(recorded("version-hermes.txt"))).toBe("0.21.7+495.g6e7b83a");
  });

  it("returns null when there is no version", () => {
    expect(parseVersion("no digits here")).toBeNull();
  });
});

describe("detectCli", () => {
  const spec = { ...claudeSpec.detect, command: here };

  it("reports not installed when the command is not on PATH, without running anything", async () => {
    const probe: ProbeFn = async () => { throw new Error("must not run"); };
    const result = await detectCli({ ...spec, command: "definitely-not-a-real-cli" }, env, probe);
    expect(result).toMatchObject({ installed: false, command: null, auth: "unknown" });
    expect(result.reason).toContain("not on PATH");
  });

  it("uses only the exit code of the status command for auth", async () => {
    const calls: string[][] = [];
    const probe: ProbeFn = async (_cmd, args) => { calls.push(args); return args[0] === "--version" ? { code: 0, stdout: recorded("version-claude.txt"), missing: false } : { code: 0, stdout: '{"email":"someone@example.com"}', missing: false }; };
    const result = await detectCli(spec, env, probe);
    expect(result).toMatchObject({ installed: true, version: "2.1.222", auth: "authenticated" });
    expect(calls).toEqual([["--version"], ["auth", "status"]]);
    expect(JSON.stringify(result)).not.toContain("example.com");
  });

  it("reports unauthenticated on a non-zero status exit", async () => {
    const probe: ProbeFn = async (_c, args) => ({ code: args[0] === "--version" ? 0 : 1, stdout: "0.1.0", missing: false });
    expect((await detectCli({ ...codexSpec.detect, command: here }, env, probe)).auth).toBe("unauthenticated");
  });

  it("leaves auth unknown for a CLI with no status command (hermes)", async () => {
    const probe: ProbeFn = async () => ({ code: 0, stdout: recorded("version-hermes.txt"), missing: false });
    expect(await detectCli({ ...hermesSpec.detect, command: here }, env, probe)).toMatchObject({ installed: true, auth: "unknown", selfApproving: true });
  });

  it("does not execute a user-declared CLI to probe it", async () => {
    const probe: ProbeFn = async () => { throw new Error("must not run"); };
    expect(await detectCli({ runtimeId: "mine", command: here, selfApproving: true, runVersion: false }, env, probe)).toMatchObject({ installed: true, version: null, auth: "unknown" });
  });

  it("treats a failing --version as not installed", async () => {
    const probe: ProbeFn = async () => ({ code: 127, stdout: "", missing: false });
    expect((await detectCli(spec, env, probe)).installed).toBe(false);
  });
});

describe("isOnPath", () => {
  it("accepts an existing absolute path and rejects a missing one", () => {
    expect(isOnPath(here, {})).toBe(true);
    expect(isOnPath("/nope/not-here", {})).toBe(false);
  });
});
