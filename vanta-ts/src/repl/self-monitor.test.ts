import { describe, it, expect } from "vitest";
import { isDestructiveAction, isAdditiveGoal, buildSelfMonitorText, shouldWarn } from "./self-monitor.js";

describe("isDestructiveAction", () => {
  it("returns true for descriptions containing destructive keywords", () => {
    expect(isDestructiveAction("delete /tmp/file.txt")).toBe(true);
    expect(isDestructiveAction("drop table users")).toBe(true);
    expect(isDestructiveAction("overwrite config.json")).toBe(true);
    expect(isDestructiveAction("reset --hard")).toBe(true);
  });

  it("returns false for read-only or constructive actions", () => {
    expect(isDestructiveAction("read_file src/index.ts")).toBe(false);
    expect(isDestructiveAction("write_file with new content")).toBe(false);
    expect(isDestructiveAction("shell_cmd: npm install")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isDestructiveAction("DELETE /tmp/file")).toBe(true);
    expect(isDestructiveAction("TRUNCATE table")).toBe(true);
  });
});

describe("isAdditiveGoal", () => {
  it("returns true when goal text contains additive verbs", () => {
    expect(isAdditiveGoal("build the EF pebbles")).toBe(true);
    expect(isAdditiveGoal("implement the feature")).toBe(true);
    expect(isAdditiveGoal("add /where command")).toBe(true);
    expect(isAdditiveGoal("ship the release")).toBe(true);
  });

  it("returns false for neutral or non-additive goals", () => {
    expect(isAdditiveGoal("investigate the bug")).toBe(false);
    expect(isAdditiveGoal("research the options")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAdditiveGoal("BUILD the thing")).toBe(true);
  });
});

describe("shouldWarn", () => {
  it("returns true when action is destructive and goal is additive", () => {
    expect(shouldWarn("delete /home/data", "build the project")).toBe(true);
  });

  it("returns false when action is not destructive", () => {
    expect(shouldWarn("read_file src/index.ts", "build the project")).toBe(false);
  });

  it("returns false when goal is not additive", () => {
    expect(shouldWarn("delete /tmp", "investigate the incident")).toBe(false);
  });

  it("returns false when no goal is provided", () => {
    expect(shouldWarn("delete /tmp", undefined)).toBe(false);
  });
});

describe("buildSelfMonitorText", () => {
  it("names the tool and mentions the conflict", () => {
    const text = buildSelfMonitorText("shell_cmd", "build the project");
    expect(text).toContain("shell_cmd");
    expect(text).toMatch(/destructive|goal is additive/i);
  });
});
