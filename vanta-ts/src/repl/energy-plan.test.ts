import { describe, it, expect } from "vitest";
import { classifyEnergyTier, taskToAction, energyPlan, formatEnergyPlan } from "./energy-plan.js";
import type { OperatorTask } from "../task-stack/types.js";

function task(overrides: Partial<OperatorTask>): OperatorTask {
  const now = new Date().toISOString();
  return {
    id: "test-id",
    title: "Test task",
    status: "active",
    source: "user",
    createdAt: now,
    updatedAt: now,
    why: "testing",
    ...overrides,
  };
}

describe("classifyEnergyTier", () => {
  it("classifies admin tasks", () => {
    expect(classifyEnergyTier(task({ title: "review the PR" }))).toBe("admin");
    expect(classifyEnergyTier(task({ title: "triage inbox" }))).toBe("admin");
  });

  it("classifies deep-work tasks", () => {
    expect(classifyEnergyTier(task({ title: "implement the auth flow" }))).toBe("deep-work");
    expect(classifyEnergyTier(task({ title: "refactor session store" }))).toBe("deep-work");
    expect(classifyEnergyTier(task({ priority: "high", title: "fix the crash" }))).toBe("deep-work");
  });

  it("classifies 2-min tasks", () => {
    expect(classifyEnergyTier(task({ title: "rename the variable", priority: "low" }))).toBe("2-min");
    expect(classifyEnergyTier(task({ title: "close the stale issue" }))).toBe("2-min");
  });

  it("defaults to low-energy", () => {
    expect(classifyEnergyTier(task({ title: "read through the docs" }))).toBe("low-energy");
  });
});

describe("energyPlan", () => {
  it("returns empty for no actionable tasks", () => {
    expect(energyPlan([])).toEqual([]);
    expect(energyPlan([task({ status: "blocked" })])).toEqual([]);
  });

  it("returns one action per tier max", () => {
    const tasks = [
      task({ title: "review the PR", status: "active" }),
      task({ title: "implement auth", status: "active" }),
      task({ title: "rename var", priority: "low", status: "pending" }),
      task({ title: "read docs", status: "pending" }),
      task({ title: "triage inbox", status: "pending" }), // second admin — skipped
    ];
    const plan = energyPlan(tasks);
    const tiers = plan.map((a) => a.tier);
    // No duplicate tiers
    expect(new Set(tiers).size).toBe(tiers.length);
    expect(tiers.length).toBeLessThanOrEqual(4);
  });

  it("uses nextAction when available", () => {
    const t = task({ title: "Big feature", nextAction: "Start with the types file", status: "active" });
    const plan = energyPlan([t]);
    expect(plan[0]!.action).toBe("Start with the types file");
  });
});

describe("formatEnergyPlan", () => {
  it("shows a no-tasks message when empty", () => {
    expect(formatEnergyPlan([])).toContain("no actionable tasks");
  });

  it("formats actions with tier labels", () => {
    const actions = energyPlan([
      task({ title: "review", status: "active" }),
      task({ title: "implement", status: "active" }),
    ]);
    const output = formatEnergyPlan(actions);
    expect(output).toContain("[");
    expect(output.split("\n").length).toBeGreaterThan(0);
  });
});
