import { describe, it, expect } from "vitest";
import { checkGate, formatCycleLog, resolveAutonomyLevel } from "./run.js";
import type { FactoryConfig, CycleResult } from "./types.js";

const baseConfig: FactoryConfig = {
  argoRoot: "/repo",
  dataDir: "/home/.argo",
  autonomyLevel: 1,
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

  it("formats committed (pushed) with token spend", () => {
    const r: CycleResult = {
      status: "committed",
      workItem: { category: "roadmap", description: "Add foo" },
      branch: "factory/auto-20260603-1400",
      commitSha: "abc1234",
      tokenSpend: 12_500,
      pushed: true,
    };
    const log = formatCycleLog(r);
    expect(log).toContain("committed");
    expect(log).toContain("pushed");
    expect(log).toContain("12,500");
    expect(log).toContain("factory/auto-20260603-1400");
  });

  it("formats committed (local, not pushed)", () => {
    const r: CycleResult = {
      status: "committed",
      workItem: { category: "roadmap", description: "Add foo" },
      branch: "factory/auto-x",
      commitSha: "abc1234",
      tokenSpend: 100,
      pushed: false,
    };
    expect(formatCycleLog(r)).toContain("not pushed");
  });

  it("formats implemented (verified, awaiting commit)", () => {
    const r: CycleResult = {
      status: "implemented",
      workItem: { category: "quality", description: "Refactor bar" },
      branch: "factory/auto-y",
      tokenSpend: 2_000,
    };
    const log = formatCycleLog(r);
    expect(log).toContain("implemented");
    expect(log).toContain("NOT committed");
  });

  it("formats merged with the integration target", () => {
    const r: CycleResult = {
      status: "merged",
      workItem: { category: "quality", description: "Tidy a tool" },
      branch: "factory/auto-z",
      commitSha: "def5678",
      tokenSpend: 3_000,
      mergedInto: "factory/integration",
    };
    const log = formatCycleLog(r);
    expect(log).toContain("merged");
    expect(log).toContain("factory/integration");
    expect(log).toContain("def5678");
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

describe("resolveAutonomyLevel", () => {
  it("review / improve is always L1 (suggest)", () => {
    expect(resolveAutonomyLevel("review", {} as NodeJS.ProcessEnv)).toBe(1);
    expect(resolveAutonomyLevel("", { VANTA_AUTONOMY_LEVEL: "4" } as NodeJS.ProcessEnv)).toBe(1);
  });

  it("approve defaults to L4 (commit + push) when unset", () => {
    expect(resolveAutonomyLevel("approve", {} as NodeJS.ProcessEnv)).toBe(4);
  });

  it("approve honors VANTA_AUTONOMY_LEVEL 2 and 3", () => {
    expect(resolveAutonomyLevel("approve", { VANTA_AUTONOMY_LEVEL: "2" } as NodeJS.ProcessEnv)).toBe(2);
    expect(resolveAutonomyLevel("approve", { VANTA_AUTONOMY_LEVEL: "3" } as NodeJS.ProcessEnv)).toBe(3);
  });

  it("allows L5 (merge) and clamps above it to the max implemented level (5)", () => {
    expect(resolveAutonomyLevel("approve", { VANTA_AUTONOMY_LEVEL: "5" } as NodeJS.ProcessEnv)).toBe(5);
    expect(resolveAutonomyLevel("approve", { VANTA_AUTONOMY_LEVEL: "99" } as NodeJS.ProcessEnv)).toBe(5);
  });

  it("falls back to L4 on garbage input", () => {
    expect(resolveAutonomyLevel("approve", { VANTA_AUTONOMY_LEVEL: "abc" } as NodeJS.ProcessEnv)).toBe(4);
  });
});
