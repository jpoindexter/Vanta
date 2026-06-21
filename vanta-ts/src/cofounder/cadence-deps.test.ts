import { describe, expect, it } from "vitest";
import { openGoalIdsFor, remainingBudgetFor, nextAssignedTask } from "./cadence-deps.js";
import type { Department } from "./department.js";
import type { WorkerTask } from "../team/tasks.js";
import type { Budget } from "../budget/types.js";
import type { Goal } from "../types.js";

// CADENCE-WIRE pure mappers — live org snapshots → cadence ports. No I/O.

function dept(over: Partial<Department> = {}): Department {
  return {
    id: "growth",
    name: "Growth",
    workerIds: ["w-1"],
    budgetScope: "dept:growth",
    goalIds: [1, 2],
    skillIds: [],
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...over,
  };
}

function task(over: Partial<WorkerTask>): WorkerTask {
  return {
    kind: "task",
    id: "t-1",
    workerId: "w-1",
    title: "do thing",
    status: "assigned",
    created: "2026-06-20T01:00:00.000Z",
    updated: "2026-06-20T01:00:00.000Z",
    ...over,
  };
}

function budget(over: Partial<Budget> = {}): Budget {
  return {
    scope: "dept:growth",
    limitUsd: 100,
    warnFraction: 0.8,
    spentUsd: 30,
    status: "active",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...over,
  };
}

describe("openGoalIdsFor", () => {
  it("returns only owned goals that are still active", () => {
    const goals: Goal[] = [
      { id: 1, text: "a", status: "active" },
      { id: 2, text: "b", status: "done" },
      { id: 3, text: "c", status: "active" }, // not owned
    ];
    expect(openGoalIdsFor(dept(), goals)).toEqual([1]);
  });

  it("is empty when the department owns no active goals", () => {
    expect(openGoalIdsFor(dept({ goalIds: [99] }), [{ id: 1, text: "a", status: "active" }])).toEqual([]);
  });

  it("is empty for an empty goal ledger (degrades cleanly)", () => {
    expect(openGoalIdsFor(dept(), [])).toEqual([]);
  });
});

describe("remainingBudgetFor", () => {
  it("returns USD remaining for a set budget", () => {
    expect(remainingBudgetFor(budget({ limitUsd: 100, spentUsd: 30 }))).toBe(70);
  });

  it("never goes negative when overspent", () => {
    expect(remainingBudgetFor(budget({ limitUsd: 50, spentUsd: 80 }))).toBe(0);
  });

  it("returns null (unbounded → available) when no budget is set", () => {
    expect(remainingBudgetFor(null)).toBeNull();
  });
});

describe("nextAssignedTask", () => {
  it("picks the oldest still-assigned task owned by a department worker", () => {
    const tasks: WorkerTask[] = [
      task({ id: "t-new", created: "2026-06-20T05:00:00.000Z" }),
      task({ id: "t-old", created: "2026-06-20T02:00:00.000Z" }),
    ];
    expect(nextAssignedTask(dept(), tasks)).toEqual({ id: "t-old" });
  });

  it("ignores tasks for workers outside the department", () => {
    const tasks: WorkerTask[] = [task({ id: "t-other", workerId: "w-9" })];
    expect(nextAssignedTask(dept(), tasks)).toBeNull();
  });

  it("ignores non-assigned (running/done/blocked) tasks", () => {
    const tasks: WorkerTask[] = [
      task({ id: "t-run", status: "running" }),
      task({ id: "t-done", status: "done" }),
    ];
    expect(nextAssignedTask(dept(), tasks)).toBeNull();
  });

  it("respects latest-write-wins on the append-only ledger", () => {
    // Same id appended twice: first assigned, then running → no longer queued.
    const tasks: WorkerTask[] = [
      task({ id: "t-1", status: "assigned", updated: "2026-06-20T01:00:00.000Z" }),
      task({ id: "t-1", status: "running", updated: "2026-06-20T03:00:00.000Z" }),
    ];
    expect(nextAssignedTask(dept(), tasks)).toBeNull();
  });

  it("returns null for an empty ledger (degrades cleanly)", () => {
    expect(nextAssignedTask(dept(), [])).toBeNull();
  });
});
