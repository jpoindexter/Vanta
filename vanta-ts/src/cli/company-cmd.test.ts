import { describe, expect, it, vi } from "vitest";
import {
  formatCompanyTick,
  handleCompanyTick,
  buildCompanyTickDeps,
  type CompanyDeps,
  type CompanyTickSources,
} from "./company-cmd.js";
import { runCompanyTick } from "../cofounder/cadence.js";
import type { CadenceDepartment, CadenceTask, CompanyTickResult, DispatchOutcome } from "../cofounder/cadence.js";
import type { Department } from "../cofounder/department.js";
import type { WorkerTask } from "../team/tasks.js";
import type { Budget } from "../budget/types.js";
import type { Goal } from "../types.js";

// `vanta company tick` surface — `handleCompanyTick` is pure over injected cadence
// deps + a log sink; `formatCompanyTick` is a pure renderer. No real I/O.

const FIXED_NOW = new Date("2026-06-20T12:00:00.000Z");

type DeptFixture = {
  id: string;
  openGoals: number[];
  remainingBudget: number | null;
  nextTask: CadenceTask | null;
  dispatch?: DispatchOutcome;
};

function buildDeps(fixtures: DeptFixture[]): { deps: CompanyDeps; lines: string[] } {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const get = (dept: CadenceDepartment): DeptFixture => {
    const f = byId.get(dept.id);
    if (!f) throw new Error(`no fixture for ${dept.id}`);
    return f;
  };
  const lines: string[] = [];
  const deps: CompanyDeps = {
    listDepartments: async () => fixtures.map((f) => ({ id: f.id })),
    openGoalsFor: async (dept) => get(dept).openGoals,
    remainingBudgetFor: async (dept) => get(dept).remainingBudget,
    nextTaskFor: async (dept) => get(dept).nextTask,
    dispatch: vi.fn(async (dept: CadenceDepartment): Promise<DispatchOutcome> => get(dept).dispatch ?? { ok: true }),
    now: () => FIXED_NOW,
    log: (line) => lines.push(line),
  };
  return { deps, lines };
}

describe("handleCompanyTick", () => {
  it("logs a per-department beat summary and returns exit 0", async () => {
    const { deps, lines } = buildDeps([
      { id: "growth", openGoals: [1], remainingBudget: 50, nextTask: { id: "g-1" } },
      { id: "ops", openGoals: [], remainingBudget: 50, nextTask: null },
    ]);

    const code = await handleCompanyTick(deps);

    expect(code).toBe(0);
    expect(lines).toHaveLength(1);
    const out = lines[0] ?? "";
    expect(out).toContain("1/2 department(s) advanced");
    expect(out).toContain("▸ growth · dispatched g-1");
    expect(out).toContain("· ops · skipped — no open standing goals");
  });

  it("reports the no-departments case for an empty company", async () => {
    const { deps, lines } = buildDeps([]);

    const code = await handleCompanyTick(deps);

    expect(code).toBe(0);
    expect(lines[0]).toContain("no departments");
  });
});

describe("formatCompanyTick", () => {
  function result(beats: CompanyTickResult["beats"]): CompanyTickResult {
    return { beats, dispatched: beats.filter((b) => b.dispatched).length, at: FIXED_NOW.toISOString() };
  }

  it("renders the empty company as a single guidance line", () => {
    expect(formatCompanyTick(result([]))).toContain("no departments");
  });

  it("renders one line per beat with a dispatch/skip glyph and reason", () => {
    const out = formatCompanyTick(
      result([
        { departmentId: "growth", dispatched: true, reason: "dispatched", taskId: "g-1" },
        { departmentId: "product", dispatched: false, reason: "no-budget" },
        { departmentId: "ops", dispatched: false, reason: "no-task" },
        { departmentId: "sales", dispatched: false, reason: "dispatch-failed", taskId: "s-1", error: "worker busy" },
      ]),
    );

    expect(out).toContain("1/4 department(s) advanced");
    expect(out).toContain("▸ growth · dispatched g-1");
    expect(out).toContain("· product · skipped — no remaining budget");
    expect(out).toContain("· ops · skipped — no queued task");
    expect(out).toContain("· sales · skipped — dispatch failed: worker busy");
  });
});

describe("buildCompanyTickDeps (live wire)", () => {
  const NOW = new Date("2026-06-20T12:00:00.000Z");

  function dept(over: Partial<Department> = {}): Department {
    return {
      id: "growth",
      name: "Growth",
      workerIds: ["w-1"],
      budgetScope: "dept:growth",
      goalIds: [1],
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
      title: "ship",
      status: "assigned",
      created: "2026-06-20T01:00:00.000Z",
      updated: "2026-06-20T01:00:00.000Z",
      ...over,
    };
  }

  const budget: Budget = {
    scope: "dept:growth",
    limitUsd: 100,
    warnFraction: 0.8,
    spentUsd: 0,
    status: "active",
    updatedAt: "2026-06-20T00:00:00.000Z",
  };

  function sources(over: Partial<CompanyTickSources> = {}): { src: CompanyTickSources; dispatched: string[] } {
    const dispatched: string[] = [];
    const src: CompanyTickSources = {
      listDepartments: async () => [dept()],
      getGoals: async (): Promise<Goal[]> => [{ id: 1, text: "grow", status: "active" }],
      getBudget: async () => budget,
      readTasks: async () => [task({ id: "t-1" })],
      dispatch: async (id) => {
        dispatched.push(id);
        return { ok: true };
      },
      now: () => NOW,
      ...over,
    };
    return { src, dispatched };
  }

  it("feeds real departments/goals/budget/task into the pure runner and dispatches one task", async () => {
    const { src, dispatched } = sources();
    const result = await runCompanyTick(buildCompanyTickDeps(src, () => {}));

    expect(result.dispatched).toBe(1);
    expect(result.beats[0]).toMatchObject({ departmentId: "growth", dispatched: true, taskId: "t-1" });
    expect(dispatched).toEqual(["t-1"]);
  });

  it("skips a department whose owned goals are all done (no-open-goals)", async () => {
    const { src } = sources({ getGoals: async () => [{ id: 1, text: "grow", status: "done" }] });
    const result = await runCompanyTick(buildCompanyTickDeps(src, () => {}));
    expect(result.beats[0]).toMatchObject({ dispatched: false, reason: "no-open-goals" });
  });

  it("skips when the scope budget is exhausted (no-budget)", async () => {
    const { src } = sources({ getBudget: async () => ({ ...budget, spentUsd: 100 }) });
    const result = await runCompanyTick(buildCompanyTickDeps(src, () => {}));
    expect(result.beats[0]).toMatchObject({ dispatched: false, reason: "no-budget" });
  });

  it("treats an unset budget as unbounded (still dispatches)", async () => {
    const { src } = sources({ getBudget: async () => null });
    const result = await runCompanyTick(buildCompanyTickDeps(src, () => {}));
    expect(result.beats[0]).toMatchObject({ dispatched: true });
  });

  it("skips when no task is queued (no-task)", async () => {
    const { src } = sources({ readTasks: async () => [] });
    const result = await runCompanyTick(buildCompanyTickDeps(src, () => {}));
    expect(result.beats[0]).toMatchObject({ dispatched: false, reason: "no-task" });
  });

  it("degrades to an empty no-op tick when the department source fails (errors-as-values)", async () => {
    const { src } = sources({
      listDepartments: async () => {
        throw new Error("store unreachable");
      },
    });
    const result = await runCompanyTick(buildCompanyTickDeps(src, () => {}));
    expect(result.beats).toEqual([]);
    expect(result.dispatched).toBe(0);
  });

  it("degrades a per-read failure to a safe skip, not a throw", async () => {
    const { src } = sources({
      getGoals: async () => {
        throw new Error("kernel down");
      },
    });
    const result = await runCompanyTick(buildCompanyTickDeps(src, () => {}));
    // No goals readable → no-open-goals skip; the tick still completes.
    expect(result.beats[0]).toMatchObject({ dispatched: false, reason: "no-open-goals" });
  });
});
