import { describe, it, expect } from "vitest";
import {
  parseAliases,
  parseFunctions,
  parsePath,
  buildSnapshotCommand,
  parseShellSnapshot,
  captureShellSnapshot,
} from "./snapshot.js";

describe("parseAliases", () => {
  it("parses a multi-alias block with quoted values", () => {
    const block = ["alias ll='ls -la'", "alias gs='git status'", "alias ..='cd ..'"].join("\n");
    expect(parseAliases(block)).toEqual({ ll: "ls -la", gs: "git status", "..": "cd .." });
  });

  it("parses unquoted alias values", () => {
    expect(parseAliases("alias g=git")).toEqual({ g: "git" });
  });

  it("strips both single and double quotes", () => {
    const block = ["alias a='single quoted'", 'alias b="double quoted"'].join("\n");
    expect(parseAliases(block)).toEqual({ a: "single quoted", b: "double quoted" });
  });

  it("tolerates a missing leading `alias` keyword (zsh form)", () => {
    expect(parseAliases("ll='ls -la'")).toEqual({ ll: "ls -la" });
  });

  it("skips blank lines and lines without an `=`", () => {
    const block = ["alias ll='ls -la'", "", "not an alias line", "alias gs='git status'"].join("\n");
    expect(parseAliases(block)).toEqual({ ll: "ls -la", gs: "git status" });
  });

  it("returns an empty map for empty input", () => {
    expect(parseAliases("")).toEqual({});
  });
});

describe("parseFunctions", () => {
  it("extracts names from `declare -f name` (names-only) form", () => {
    const block = ["declare -f foo", "declare -f bar_baz", "declare -f _hidden"].join("\n");
    expect(parseFunctions(block)).toEqual(["foo", "bar_baz", "_hidden"]);
  });

  it("extracts names from `name () {` full-body form, ignoring body lines", () => {
    const block = ["greet () {", '  echo "hi"', "}", "deploy ()", "{", "  run", "}"].join("\n");
    expect(parseFunctions(block)).toEqual(["greet", "deploy"]);
  });

  it("handles the `function name {` keyword form", () => {
    expect(parseFunctions("function build () {\n  make\n}")).toEqual(["build"]);
  });

  it("de-dupes repeated names, keeping first-seen order", () => {
    const block = ["declare -f foo", "foo () {", "  body", "}", "declare -f bar"].join("\n");
    expect(parseFunctions(block)).toEqual(["foo", "bar"]);
  });

  it("returns an empty array when no functions are declared", () => {
    expect(parseFunctions("")).toEqual([]);
  });
});

describe("parsePath", () => {
  it("splits on `:` and drops empty segments", () => {
    expect(parsePath("/usr/bin:/bin:/usr/local/bin")).toEqual(["/usr/bin", "/bin", "/usr/local/bin"]);
  });

  it("drops leading, trailing, and doubled-colon empties", () => {
    expect(parsePath(":/usr/bin::/bin:")).toEqual(["/usr/bin", "/bin"]);
  });

  it("returns an empty array for an empty PATH", () => {
    expect(parsePath("")).toEqual([]);
  });
});

describe("buildSnapshotCommand", () => {
  it("uses `declare -f` for bash and includes all three section markers", () => {
    const cmd = buildSnapshotCommand("/bin/bash");
    expect(cmd).toContain("declare -f");
    expect(cmd).toContain("alias");
    expect(cmd).toContain('echo "$PATH"');
    expect(cmd).toContain("###VANTA_ALIASES###");
    expect(cmd).toContain("###VANTA_FUNCTIONS###");
    expect(cmd).toContain("###VANTA_PATH###");
  });

  it("uses `functions` for zsh", () => {
    const cmd = buildSnapshotCommand("/bin/zsh");
    expect(cmd).toContain("functions");
    expect(cmd).not.toContain("declare -f");
  });
});

describe("parseShellSnapshot", () => {
  it("splits a combined dump on markers and parses each section", () => {
    const raw = [
      "###VANTA_ALIASES###",
      "alias ll='ls -la'",
      "alias gs='git status'",
      "###VANTA_FUNCTIONS###",
      "greet () {",
      '  echo "hi"',
      "}",
      "###VANTA_PATH###",
      "/usr/bin:/bin",
    ].join("\n");
    expect(parseShellSnapshot(raw)).toEqual({
      aliases: { ll: "ls -la", gs: "git status" },
      functions: ["greet"],
      path: ["/usr/bin", "/bin"],
    });
  });

  it("tolerates empty alias and function sections", () => {
    const raw = ["###VANTA_ALIASES###", "###VANTA_FUNCTIONS###", "###VANTA_PATH###", "/usr/bin"].join("\n");
    expect(parseShellSnapshot(raw)).toEqual({ aliases: {}, functions: [], path: ["/usr/bin"] });
  });

  it("yields an all-empty snapshot when no markers are present", () => {
    expect(parseShellSnapshot("garbage output")).toEqual({ aliases: {}, functions: [], path: [] });
  });
});

describe("captureShellSnapshot", () => {
  const FIXTURE = [
    "###VANTA_ALIASES###",
    "alias ll='ls -la'",
    "###VANTA_FUNCTIONS###",
    "declare -f deploy",
    "###VANTA_PATH###",
    "/usr/bin:/bin",
  ].join("\n");

  it("captures a snapshot via an injected runner (no real shell)", async () => {
    const calls: string[] = [];
    const runShell = async (command: string) => {
      calls.push(command);
      return FIXTURE;
    };
    const result = await captureShellSnapshot({ runShell, shell: "bash" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot).toEqual({
        aliases: { ll: "ls -la" },
        functions: ["deploy"],
        path: ["/usr/bin", "/bin"],
      });
    }
    // ran exactly the built snapshot command, once
    expect(calls).toEqual([buildSnapshotCommand("bash")]);
  });

  it("defaults the shell to bash when none is provided", async () => {
    const calls: string[] = [];
    const runShell = async (command: string) => {
      calls.push(command);
      return FIXTURE;
    };
    await captureShellSnapshot({ runShell });
    expect(calls).toEqual([buildSnapshotCommand("bash")]);
  });

  it("returns a clean error value when the runner fails (never throws)", async () => {
    const runShell = async () => {
      throw new Error("shell not found");
    };
    const result = await captureShellSnapshot({ runShell });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("shell snapshot failed: shell not found");
    }
  });
});
