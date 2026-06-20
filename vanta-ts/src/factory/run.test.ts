import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { checkGate, formatCycleLog, resolveAutonomyLevel, runCycle, defaultFactoryDeps } from "./run.js";
import type { FactoryConfig, CycleResult, FactoryDeps, FactoryPlan, SliceArtifact, WorkItem, VcsAdapter } from "./types.js";

function fakeVcs(): VcsAdapter {
  return {
    isTreeDirty: async () => false,
    currentBranch: async () => "main",
    createBranch: async () => "factory/auto-test",
    commit: async () => "abc1234",
    push: async () => {},
    merge: async () => true,
    lastCommitLineCount: async () => 0,
    discardSlice: async () => {},
  };
}

const baseConfig: FactoryConfig = {
  vantaRoot: "/repo",
  dataDir: "/home/.vanta",
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

describe("runCycle FactoryDeps injection (PORT-FACTORY-DEPS)", () => {
  it("defaultFactoryDeps wires every stage + the git adapter", () => {
    expect(typeof defaultFactoryDeps.triage).toBe("function");
    expect(typeof defaultFactoryDeps.plan).toBe("function");
    expect(typeof defaultFactoryDeps.execute).toBe("function");
    expect(typeof defaultFactoryDeps.verify).toBe("function");
    expect(typeof defaultFactoryDeps.vcs.createBranch).toBe("function");
  });

  it("routes through injected deps and stops at nothing-to-do without touching execute/git", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-factory-di-"));
    const dataDir = join(root, ".vanta");
    await mkdir(dataDir, { recursive: true });
    let triaged = false;
    let executed = false;
    const deps: FactoryDeps = {
      triage: async () => { triaged = true; return null; },
      plan: () => { throw new Error("plan must not run when triage is empty"); },
      execute: async () => { executed = true; throw new Error("execute must not run"); },
      verify: async () => ({ ok: true }),
      vcs: fakeVcs(),
    };
    const config: FactoryConfig = { vantaRoot: root, dataDir, autonomyLevel: 4, budgetTokens: 1000, interactive: false };
    const result = await runCycle(config, () => {}, deps);
    expect(result.status).toBe("nothing-to-do");
    expect(triaged).toBe(true);
    expect(executed).toBe(false);
    await rm(root, { recursive: true, force: true });
  });

  it("drives a full L2 cycle through injected stages with no real git/LLM", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-factory-di-"));
    const dataDir = join(root, ".vanta");
    await mkdir(dataDir, { recursive: true });
    // listPreExistingFiles runs `git ls-files`; a bare init repo answers cleanly.
    execFileSync("git", ["init", "-q"], { cwd: root });
    const prevThreshold = process.env.VANTA_PREFLIGHT_THRESHOLD;
    process.env.VANTA_PREFLIGHT_THRESHOLD = "2"; // never clarify in the test
    const item: WorkItem = {
      category: "roadmap",
      description: "Add a clearly specified helper to x.ts that returns a computed value",
      hint: "concrete and specific",
      targetFile: "vanta-ts/src/x.ts",
      roadmapId: "TEST-DI",
    };
    const plan: FactoryPlan = { workItem: item, instruction: "implement x", touchedDirs: ["vanta-ts/src"] };
    const artifact: SliceArtifact = { newTestFiles: [], touchedFiles: ["vanta-ts/src/x.ts"], tokenSpend: 5 };
    let executed = false;
    let verified = false;
    const deps: FactoryDeps = {
      triage: async () => item,
      plan: () => plan,
      execute: async () => { executed = true; return artifact; },
      verify: async () => { verified = true; return { ok: true }; },
      vcs: fakeVcs(),
    };
    const config: FactoryConfig = { vantaRoot: root, dataDir, autonomyLevel: 2, budgetTokens: 1000, interactive: false };
    try {
      const result = await runCycle(config, () => {}, deps);
      expect(result.status).toBe("implemented");
      expect(executed).toBe(true);
      expect(verified).toBe(true);
    } finally {
      if (prevThreshold === undefined) delete process.env.VANTA_PREFLIGHT_THRESHOLD;
      else process.env.VANTA_PREFLIGHT_THRESHOLD = prevThreshold;
      await rm(root, { recursive: true, force: true });
    }
  });
});
