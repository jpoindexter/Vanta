import { describe, it, expect } from "vitest";
import { checkGate, formatCycleLog } from "./run.js";
import type { FactoryConfig, CycleResult } from "./types.js";

const baseConfig: FactoryConfig = {
  argoRoot: "/repo",
  dataDir: "/home/.argo",
  autonomy: "review",
  budgetTokens: 80_000,
  interactive: false,
};

describe("checkGate", () => {
  it("bails when disabled flag is set", () => {
    const r = checkGate(baseConfig, { disabled: true, lockExists: false, treeDirty: false });
    expect(r).toMatch(/disabled/i);
  });

  it("bails when lockfile exists", () => {
    const r = checkGate(baseConfig, { disabled: false, lockExists: true, treeDirty: false });
    expect(r).toMatch(/lock/i);
  });

  it("bails when working tree is dirty", () => {
    const r = checkGate(baseConfig, { disabled: false, lockExists: false, treeDirty: true });
    expect(r).toMatch(/dirty|uncommitted/i);
  });

  it("returns null when all clear", () => {
    const r = checkGate(baseConfig, { disabled: false, lockExists: false, treeDirty: false });
    expect(r).toBeNull();
  });
});

describe("formatCycleLog", () => {
  it("formats nothing-to-do", () => {
    const r: CycleResult = { status: "nothing-to-do" };
    expect(formatCycleLog(r)).toContain("nothing to do");
  });

  it("formats aborted", () => {
    const r: CycleResult = { status: "aborted", reason: "disabled" };
    expect(formatCycleLog(r)).toContain("aborted");
    expect(formatCycleLog(r)).toContain("disabled");
  });

  it("formats committed with token spend", () => {
    const r: CycleResult = {
      status: "committed",
      workItem: { category: "roadmap", description: "Add foo" },
      branch: "factory/auto-20260603-1400",
      commitSha: "abc1234",
      tokenSpend: 12_500,
    };
    const log = formatCycleLog(r);
    expect(log).toContain("committed");
    expect(log).toContain("12,500");
    expect(log).toContain("factory/auto-20260603-1400");
  });

  it("formats verify-failed", () => {
    const r: CycleResult = {
      status: "verify-failed",
      workItem: { category: "test-failure", description: "Fix foo" },
      reason: "new test passes on pre-change code",
    };
    expect(formatCycleLog(r)).toContain("verify-failed");
    expect(formatCycleLog(r)).toContain("pre-change");
  });
});
