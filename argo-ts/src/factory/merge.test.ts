import { describe, it, expect } from "vitest";
import {
  assessMergeRisk,
  resolveMergeTarget,
  isDefaultBranch,
  MAX_MERGE_DIFF_LINES,
  MAX_MERGE_FILES,
} from "./merge.js";

const armed = {
  touchedFiles: ["argo-ts/src/tools/web-search.ts", "argo-ts/src/tools/web-search.test.ts"],
  diffLineCount: 40,
  allowMerge: true,
  mergeTarget: "factory/integration",
};

describe("assessMergeRisk", () => {
  it("merges a small, armed, pure-limbs slice into a non-default target", () => {
    const d = assessMergeRisk(armed);
    expect(d.merge).toBe(true);
  });

  it("refuses when not armed (ARGO_AUTONOMY_ALLOW_MERGE unset)", () => {
    const d = assessMergeRisk({ ...armed, allowMerge: false });
    expect(d.merge).toBe(false);
    expect(d.reason).toMatch(/arm|allow_merge/i);
  });

  it("refuses to merge into the default branch", () => {
    expect(assessMergeRisk({ ...armed, mergeTarget: "main" }).merge).toBe(false);
    expect(assessMergeRisk({ ...armed, mergeTarget: "master" }).merge).toBe(false);
  });

  it("refuses when a touched file leaves the limbs/reflexes/memory tiers", () => {
    const d = assessMergeRisk({ ...armed, touchedFiles: [...armed.touchedFiles, "argo-ts/src/agent.ts"] });
    expect(d.merge).toBe(false);
    expect(d.reason).toMatch(/compartment|brainstem/i);
  });

  it("refuses when a dependency / lockfile changed", () => {
    expect(assessMergeRisk({ ...armed, touchedFiles: [...armed.touchedFiles, "argo-ts/package.json"] }).merge).toBe(false);
    expect(assessMergeRisk({ ...armed, touchedFiles: [...armed.touchedFiles, "argo-ts/package-lock.json"] }).merge).toBe(false);
  });

  it("refuses when env / config / migration files changed", () => {
    expect(assessMergeRisk({ ...armed, touchedFiles: [".env.example"] }).merge).toBe(false);
    expect(assessMergeRisk({ ...armed, touchedFiles: ["argo-ts/vitest.config.ts"] }).merge).toBe(false);
    expect(assessMergeRisk({ ...armed, touchedFiles: ["db/migrations/001_init.sql"] }).merge).toBe(false);
  });

  it("refuses when the diff exceeds the line bound", () => {
    const d = assessMergeRisk({ ...armed, diffLineCount: MAX_MERGE_DIFF_LINES + 1 });
    expect(d.merge).toBe(false);
    expect(d.reason).toMatch(/diff|large|line/i);
  });

  it("refuses when too many files changed", () => {
    const many = Array.from({ length: MAX_MERGE_FILES + 1 }, (_, i) => `argo-ts/src/tools/t${i}.ts`);
    expect(assessMergeRisk({ ...armed, touchedFiles: many }).merge).toBe(false);
  });
});

describe("resolveMergeTarget", () => {
  it("defaults to factory/integration", () => {
    expect(resolveMergeTarget({} as NodeJS.ProcessEnv)).toBe("factory/integration");
  });
  it("honors ARGO_FACTORY_MERGE_TARGET", () => {
    expect(resolveMergeTarget({ ARGO_FACTORY_MERGE_TARGET: "dev" } as NodeJS.ProcessEnv)).toBe("dev");
  });
});

describe("isDefaultBranch", () => {
  it("flags main and master", () => {
    expect(isDefaultBranch("main")).toBe(true);
    expect(isDefaultBranch("master")).toBe(true);
    expect(isDefaultBranch("factory/integration")).toBe(false);
  });
});
