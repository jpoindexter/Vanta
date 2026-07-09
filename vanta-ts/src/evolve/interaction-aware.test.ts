import { describe, expect, it } from "vitest";
import { composeInteractionAware, formatInteractionPlan, type ComponentEdit } from "./interaction-aware.js";

const edit = (over: Partial<ComponentEdit> & { id: string; component: string }): ComponentEdit => ({
  predictedFix: [],
  verification: [],
  isolatedLift: 0,
  ...over,
});

describe("composeInteractionAware", () => {
  it("dedupes redundant verification across interacting component edits", () => {
    const plan = composeInteractionAware([
      edit({
        id: "tools-parse",
        component: "tools",
        predictedFix: ["create-file", "patch-file"],
        verification: ["eval:create-file", "eval:patch-file"],
        isolatedLift: 6.3,
      }),
      edit({
        id: "memory-paths",
        component: "memory",
        predictedFix: ["create-file", "recall-path"],
        verification: ["eval:create-file", "eval:recall-path"],
        isolatedLift: 4.8,
      }),
    ], [
      { components: ["tools", "memory"], reason: "both spend turns rechecking path roots", penalty: 0.7 },
    ]);

    expect(plan.predictedFix).toEqual(["create-file", "patch-file", "recall-path"]);
    expect(plan.verification).toEqual(["eval:create-file", "eval:patch-file", "eval:recall-path"]);
    expect(plan.redundantChecksRemoved).toBe(1);
    expect(plan.isolatedLiftSum).toBe(11.1);
    expect(plan.expectedCombinedLift).toBe(10.4);
    expect(plan.interactions).toHaveLength(1);
  });
});

describe("formatInteractionPlan", () => {
  it("summarizes lift and removed checks", () => {
    const plan = composeInteractionAware([
      edit({ id: "a", component: "tools", verification: ["eval:a"], isolatedLift: 1 }),
      edit({ id: "b", component: "memory", verification: ["eval:a"], isolatedLift: 2 }),
    ]);

    expect(formatInteractionPlan(plan)).toContain("1 redundant check(s) removed");
    expect(formatInteractionPlan(plan)).toContain("3pp / 3pp isolated");
  });
});
