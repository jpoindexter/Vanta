import { describe, expect, it } from "vitest";
import {
  buildRelaunchArgv,
  captureStartupFlags,
  PRESERVED_FLAGS,
  serializeFlags,
  type CapturedFlag,
} from "./preserve-flags.js";

describe("captureStartupFlags", () => {
  it("returns [] for empty argv", () => {
    expect(captureStartupFlags([])).toEqual([]);
  });

  it("returns [] when argv has no known flags", () => {
    const argv = ["/usr/bin/node", "/app/cli.js", "run", "do the thing"];
    expect(captureStartupFlags(argv)).toEqual([]);
  });

  it("ignores the node/script head", () => {
    const argv = ["/usr/bin/node", "/app/cli.js", "--bare"];
    expect(captureStartupFlags(argv)).toEqual([{ flag: "--bare" }]);
  });

  it("captures a value-taking flag in --flag value form", () => {
    const argv = ["--model", "gpt-4o"];
    expect(captureStartupFlags(argv)).toEqual([{ flag: "--model", value: "gpt-4o" }]);
  });

  it("captures a value-taking flag in --flag=value form", () => {
    const argv = ["--model=gpt-4o"];
    expect(captureStartupFlags(argv)).toEqual([{ flag: "--model", value: "gpt-4o" }]);
  });

  it("captures a boolean flag with no value", () => {
    const argv = ["--fork-session"];
    expect(captureStartupFlags(argv)).toEqual([{ flag: "--fork-session" }]);
  });

  it("captures a mix of value and boolean flags, ignoring unknowns", () => {
    const argv = [
      "node",
      "cli.js",
      "--model",
      "claude-sonnet-4-6",
      "--unknown",
      "x",
      "--effort=high",
      "--bare",
      "positional",
    ];
    expect(captureStartupFlags(argv)).toEqual([
      { flag: "--model", value: "claude-sonnet-4-6" },
      { flag: "--effort", value: "high" },
      { flag: "--bare" },
    ]);
  });

  it("captures every PRESERVED_FLAGS entry", () => {
    const argv = [
      "--model", "m",
      "--provider", "p",
      "--effort", "max",
      "--permission-mode", "auto",
      "--resume", "20260101-000000",
      "--max-budget-usd", "5",
      "--bare",
      "--safe-mode",
      "--fork-session",
    ];
    const captured = captureStartupFlags(argv);
    expect(captured.map((c) => c.flag)).toEqual(PRESERVED_FLAGS.map((s) => s.flag));
  });

  it("treats a following dash-token as a missing value (empty), not the value", () => {
    const argv = ["--resume", "--bare"];
    expect(captureStartupFlags(argv)).toEqual([
      { flag: "--resume", value: "" },
      { flag: "--bare" },
    ]);
  });

  it("treats a value-taking flag at end-of-argv as empty value", () => {
    const argv = ["--effort"];
    expect(captureStartupFlags(argv)).toEqual([{ flag: "--effort", value: "" }]);
  });

  it("SECURITY: does not carry an unknown --dangerous flag", () => {
    const argv = ["--dangerous", "--model", "m", "--rm-rf"];
    expect(captureStartupFlags(argv)).toEqual([{ flag: "--model", value: "m" }]);
  });

  it("carries an empty-string value verbatim in --flag=value form", () => {
    const argv = ["--model="];
    expect(captureStartupFlags(argv)).toEqual([{ flag: "--model", value: "" }]);
  });
});

describe("buildRelaunchArgv", () => {
  it("returns [] for an empty preserved set", () => {
    expect(buildRelaunchArgv([])).toEqual([]);
  });

  it("emits preserved value flags as --flag value", () => {
    const captured: CapturedFlag[] = [{ flag: "--model", value: "gpt-4o" }];
    expect(buildRelaunchArgv(captured)).toEqual(["--model", "gpt-4o"]);
  });

  it("emits a boolean flag once with no value", () => {
    const captured: CapturedFlag[] = [{ flag: "--bare" }];
    expect(buildRelaunchArgv(captured)).toEqual(["--bare"]);
  });

  it("emits the preserved flags plus extras", () => {
    const captured: CapturedFlag[] = [{ flag: "--model", value: "gpt-4o" }];
    const extra: CapturedFlag[] = [{ flag: "--effort", value: "high" }];
    expect(buildRelaunchArgv(captured, extra)).toEqual([
      "--model", "gpt-4o",
      "--effort", "high",
    ]);
  });

  it("lets a later explicit extra override a captured same-flag", () => {
    const captured: CapturedFlag[] = [{ flag: "--model", value: "old" }];
    const extra: CapturedFlag[] = [{ flag: "--model", value: "new" }];
    expect(buildRelaunchArgv(captured, extra)).toEqual(["--model", "new"]);
  });

  it("dedupes a captured flag (later occurrence wins) into one emission", () => {
    const captured: CapturedFlag[] = [
      { flag: "--model", value: "first" },
      { flag: "--model", value: "second" },
    ];
    expect(buildRelaunchArgv(captured)).toEqual(["--model", "second"]);
  });

  it("does not duplicate a boolean flag present in both captured and extra", () => {
    const captured: CapturedFlag[] = [{ flag: "--bare" }];
    const extra: CapturedFlag[] = [{ flag: "--bare" }];
    expect(buildRelaunchArgv(captured, extra)).toEqual(["--bare"]);
  });

  it("round-trips capture → build for a full flag set", () => {
    const argv = [
      "node", "cli.js",
      "--model", "m",
      "--effort=high",
      "--bare",
      "--fork-session",
    ];
    const captured = captureStartupFlags(argv);
    expect(buildRelaunchArgv(captured)).toEqual([
      "--model", "m",
      "--effort", "high",
      "--bare",
      "--fork-session",
    ]);
  });
});

describe("serializeFlags", () => {
  it("renders an empty set as an empty string", () => {
    expect(serializeFlags([])).toBe("");
  });

  it("renders value and boolean flags readably", () => {
    const captured: CapturedFlag[] = [
      { flag: "--model", value: "gpt-4o" },
      { flag: "--bare" },
      { flag: "--effort", value: "high" },
    ];
    expect(serializeFlags(captured)).toBe("--model gpt-4o --bare --effort high");
  });
});
