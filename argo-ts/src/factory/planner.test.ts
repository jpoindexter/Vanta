import { describe, it, expect } from "vitest";
import { buildPlan } from "./planner.js";
import type { WorkItem } from "./types.js";

describe("buildPlan", () => {
  it("builds a roadmap plan with a clear instruction", () => {
    const item: WorkItem = { category: "roadmap", description: "Add foo feature (S)", sourceLine: 12 };
    const plan = buildPlan(item, "/repo");
    expect(plan.workItem).toBe(item);
    expect(plan.instruction).toContain("Add foo feature");
    expect(plan.instruction).toContain("argo-ts");
    expect(plan.touchedDirs.length).toBeGreaterThan(0);
  });

  it("builds a test-failure plan targeting the failing file", () => {
    const item: WorkItem = {
      category: "test-failure",
      description: "Fix failing test",
      targetFile: "src/tools/foo.test.ts",
      hint: "foo > does the thing",
    };
    const plan = buildPlan(item, "/repo");
    expect(plan.instruction).toContain("src/tools/foo.test.ts");
    expect(plan.instruction).toContain("foo > does the thing");
  });

  it("builds a type-error plan with the error hint", () => {
    const item: WorkItem = {
      category: "type-error",
      description: "Fix type error",
      hint: "src/foo.ts(12,5): error TS2322",
      targetFile: "src/foo.ts",
    };
    const plan = buildPlan(item, "/repo");
    expect(plan.instruction).toContain("TS2322");
  });

  it("builds a parked plan", () => {
    const item: WorkItem = { category: "parked", description: "my-parked-idea" };
    const plan = buildPlan(item, "/repo");
    expect(plan.instruction).toContain("my-parked-idea");
    expect(plan.instruction).toContain("SKIP");
  });

  it("builds a quality plan", () => {
    const item: WorkItem = { category: "quality", description: "file too large", targetFile: "src/big.ts" };
    const plan = buildPlan(item, "/repo");
    expect(plan.instruction).toContain("file too large");
    expect(plan.instruction).toContain("src/big.ts");
  });
});
