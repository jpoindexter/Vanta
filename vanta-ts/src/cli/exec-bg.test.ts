import { describe, it, expect } from "vitest";
import { parseExecFlags, buildExecBgPlan, launchExecBg } from "./exec-bg.js";
import type { BgTask } from "../tools/bg-tasks.js";

function fakeTask(command: string): BgTask {
  return { id: `bg-${command}`, command, startedAt: "now", status: "running" };
}

describe("parseExecFlags", () => {
  it("extracts each --exec <cmd> pair, leaving other args in rest", () => {
    const { commands, rest } = parseExecFlags([
      "--no-tui",
      "--exec",
      "npm run dev",
      "--exec",
      "make watch",
      "--resume",
      "abc",
    ]);
    expect(commands).toEqual(["npm run dev", "make watch"]);
    expect(rest).toEqual(["--no-tui", "--resume", "abc"]);
  });

  it("ignores a trailing --exec with no value (flag dropped, no command)", () => {
    const { commands, rest } = parseExecFlags(["chat", "--exec"]);
    expect(commands).toEqual([]);
    expect(rest).toEqual(["chat"]);
  });

  it("no --exec = empty commands and rest unchanged", () => {
    const argv = ["chat", "--no-tui", "--effort", "high"];
    const { commands, rest } = parseExecFlags(argv);
    expect(commands).toEqual([]);
    expect(rest).toEqual(argv);
  });

  it("treats a literal value that looks like a flag as the command (no value-sniffing)", () => {
    const { commands, rest } = parseExecFlags(["--exec", "--resume"]);
    expect(commands).toEqual(["--resume"]);
    expect(rest).toEqual([]);
  });
});

describe("buildExecBgPlan", () => {
  it("maps commands to ordered launch descriptors with stable labels", () => {
    expect(buildExecBgPlan(["a", "b"])).toEqual([
      { command: "a", label: "exec-1" },
      { command: "b", label: "exec-2" },
    ]);
  });

  it("returns an empty plan for no commands", () => {
    expect(buildExecBgPlan([])).toEqual([]);
  });
});

describe("launchExecBg", () => {
  it("starts each command via the injected starter and returns the count", async () => {
    const seen: string[] = [];
    const started = await launchExecBg(["npm run dev", "make watch"], async (cmd) => {
      seen.push(cmd);
      return fakeTask(cmd);
    });
    expect(seen).toEqual(["npm run dev", "make watch"]);
    expect(started).toBe(2);
  });

  it("is best-effort: a failing start does not throw and still counts the rest", async () => {
    const seen: string[] = [];
    const started = await launchExecBg(["good-1", "boom", "good-2"], async (cmd) => {
      seen.push(cmd);
      if (cmd === "boom") throw new Error("spawn failed");
      return fakeTask(cmd);
    });
    expect(seen).toEqual(["good-1", "boom", "good-2"]);
    expect(started).toBe(2);
  });

  it("starts nothing for no commands", async () => {
    let calls = 0;
    const started = await launchExecBg([], async (cmd) => {
      calls++;
      return fakeTask(cmd);
    });
    expect(calls).toBe(0);
    expect(started).toBe(0);
  });
});
