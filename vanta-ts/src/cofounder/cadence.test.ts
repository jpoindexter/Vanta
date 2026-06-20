import { describe, expect, it, vi } from "vitest";
import {
  runCompanyTick,
  type CadenceDepartment,
  type CadenceTask,
  type CompanyTickDeps,
  type DispatchOutcome,
} from "./cadence.js";

// COFOUNDER-CADENCE-LOOP — the loop is pure orchestration over injected ports;
// these tests stub every read + the dispatch side effect (no kernel, no budget
// store, no real task dispatch) and assert: dispatch when goals+budget present,
// skip-with-reason when goals or budget are missing, at-most-one task per dept,
// and an empty company → an empty summary.

const FIXED_NOW = new Date("2026-06-20T12:00:00.000Z");

type DeptFixture = {
  id: string;
  openGoals: number[];
  remainingBudget: number | null;
  nextTask: CadenceTask | null;
  dispatch?: DispatchOutcome;
};

/** Build injected deps from a per-department fixture, plus a dispatch spy. */
function buildDeps(fixtures: DeptFixture[]): { deps: CompanyTickDeps; dispatch: ReturnType<typeof vi.fn> } {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const get = (dept: CadenceDepartment): DeptFixture => {
    const f = byId.get(dept.id);
    if (!f) throw new Error(`no fixture for ${dept.id}`);
    return f;
  };
  const dispatch = vi.fn(async (dept: CadenceDepartment): Promise<DispatchOutcome> => get(dept).dispatch ?? { ok: true });
  const deps: CompanyTickDeps = {
    listDepartments: async () => fixtures.map((f) => ({ id: f.id })),
    openGoalsFor: async (dept) => get(dept).openGoals,
    remainingBudgetFor: async (dept) => get(dept).remainingBudget,
    nextTaskFor: async (dept) => get(dept).nextTask,
    dispatch,
    now: () => FIXED_NOW,
  };
  return { deps, dispatch };
}

describe("runCompanyTick", () => {
  it("dispatches one task for a department with open goals and remaining budget", async () => {
    const { deps, dispatch } = buildDeps([
      { id: "growth", openGoals: [1], remainingBudget: 50, nextTask: { id: "t-1" } },
    ]);

    const result = await runCompanyTick(deps);

    expect(result.beats).toEqual([{ departmentId: "growth", dispatched: true, reason: "dispatched", taskId: "t-1" }]);
    expect(result.dispatched).toBe(1);
    expect(result.at).toBe(FIXED_NOW.toISOString());
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ id: "growth" }, { id: "t-1" });
  });

  it("skips a department with no open standing goals, with reason", async () => {
    const { deps, dispatch } = buildDeps([
      { id: "growth", openGoals: [], remainingBudget: 50, nextTask: { id: "t-1" } },
    ]);

    const result = await runCompanyTick(deps);

    expect(result.beats).toEqual([{ departmentId: "growth", dispatched: false, reason: "no-open-goals" }]);
    expect(result.dispatched).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("skips a department with no remaining budget, with reason", async () => {
    const { deps, dispatch } = buildDeps([
      { id: "growth", openGoals: [1], remainingBudget: 0, nextTask: { id: "t-1" } },
    ]);

    const result = await runCompanyTick(deps);

    expect(result.beats).toEqual([{ departmentId: "growth", dispatched: false, reason: "no-budget" }]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("treats a null (unbounded) budget as available", async () => {
    const { deps, dispatch } = buildDeps([
      { id: "growth", openGoals: [1], remainingBudget: null, nextTask: { id: "t-1" } },
    ]);

    const result = await runCompanyTick(deps);

    expect(result.beats[0]?.dispatched).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("skips a department with open goals + budget but no queued next task", async () => {
    const { deps, dispatch } = buildDeps([
      { id: "growth", openGoals: [1], remainingBudget: 50, nextTask: null },
    ]);

    const result = await runCompanyTick(deps);

    expect(result.beats).toEqual([{ departmentId: "growth", dispatched: false, reason: "no-task" }]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("advances at most ONE task per department, even with many open goals", async () => {
    const { deps, dispatch } = buildDeps([
      { id: "growth", openGoals: [1, 2, 3, 4], remainingBudget: 100, nextTask: { id: "t-1" } },
    ]);

    const result = await runCompanyTick(deps);

    expect(result.dispatched).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("advances every eligible department, each by at most one task", async () => {
    const { deps, dispatch } = buildDeps([
      { id: "growth", openGoals: [1], remainingBudget: 50, nextTask: { id: "g-1" } },
      { id: "product", openGoals: [2], remainingBudget: 50, nextTask: { id: "p-1" } },
      { id: "ops", openGoals: [], remainingBudget: 50, nextTask: { id: "o-1" } },
    ]);

    const result = await runCompanyTick(deps);

    expect(result.beats.map((b) => ({ id: b.departmentId, d: b.dispatched, r: b.reason }))).toEqual([
      { id: "growth", d: true, r: "dispatched" },
      { id: "product", d: true, r: "dispatched" },
      { id: "ops", d: false, r: "no-open-goals" },
    ]);
    expect(result.dispatched).toBe(2);
    // One dispatch per eligible department — never more than one per dept.
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("returns an empty summary for a company with no departments", async () => {
    const { deps, dispatch } = buildDeps([]);

    const result = await runCompanyTick(deps);

    expect(result.beats).toEqual([]);
    expect(result.dispatched).toBe(0);
    expect(result.at).toBe(FIXED_NOW.toISOString());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("records a dispatch-failure beat without aborting the rest of the tick", async () => {
    const { deps, dispatch } = buildDeps([
      { id: "growth", openGoals: [1], remainingBudget: 50, nextTask: { id: "g-1" }, dispatch: { ok: false, error: "worker busy" } },
      { id: "product", openGoals: [2], remainingBudget: 50, nextTask: { id: "p-1" } },
    ]);

    const result = await runCompanyTick(deps);

    expect(result.beats).toEqual([
      { departmentId: "growth", dispatched: false, reason: "dispatch-failed", taskId: "g-1", error: "worker busy" },
      { departmentId: "product", dispatched: true, reason: "dispatched", taskId: "p-1" },
    ]);
    expect(result.dispatched).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
