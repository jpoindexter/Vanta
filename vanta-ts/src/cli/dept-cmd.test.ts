import { describe, it, expect } from "vitest";
import {
  formatDeptStatus,
  parseDeptAddArgs,
  runDeptWith,
  type DeptDeps,
} from "./dept-cmd.js";
import { addDepartment, departmentStatus, type Department } from "../cofounder/department.js";
import type { Worker } from "../team/store.js";
import type { Budget } from "../budget/types.js";
import type { Goal } from "../types.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function worker(id: string, role = "eng"): Worker {
  return { kind: "worker", id, role, status: "idle", ts: NOW.toISOString() };
}

function goal(id: number, status: Goal["status"] = "active"): Goal {
  return { id, text: `goal ${id}`, status };
}

type Harness = {
  deps: DeptDeps;
  lines: string[];
  /** Current persisted department list (writes mutate this). */
  depts: () => Department[];
  budgets: Map<string, Budget>;
};

function harness(opts?: { depts?: Department[]; workers?: Worker[]; goals?: Goal[] }): Harness {
  const lines: string[] = [];
  const state = { depts: opts?.depts ?? [] };
  const budgets = new Map<string, Budget>();
  const deps: DeptDeps = {
    readDepartments: async () => state.depts,
    writeDepartments: async (list) => {
      state.depts = list;
    },
    readWorkers: async () => opts?.workers ?? [],
    getGoals: async () => opts?.goals ?? [],
    getBudget: async (scope) => budgets.get(scope) ?? null,
    setBudget: async (scope, limitUsd) => {
      const b: Budget = { scope, limitUsd, warnFraction: 0.8, spentUsd: 0, status: "active", updatedAt: NOW.toISOString() };
      budgets.set(scope, b);
      return b;
    },
    log: (line) => lines.push(line),
    now: () => NOW,
  };
  return { deps, lines, depts: () => state.depts, budgets };
}

describe("parseDeptAddArgs", () => {
  it("parses name, repeated workers, repeated goals, budget, skills", () => {
    const r = parseDeptAddArgs([
      "Growth", "--worker", "a", "--worker", "b", "--goal", "1", "--goal", "2", "--budget", "200", "--skill", "gtm",
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("Growth");
    expect(r.value.workerIds).toEqual(["a", "b"]);
    expect(r.value.goalIds).toEqual([1, 2]);
    expect(r.value.budgetUsd).toBe(200);
    expect(r.value.skillIds).toEqual(["gtm"]);
  });

  it("defaults the budget when --budget is omitted", () => {
    const r = parseDeptAddArgs(["Growth", "--worker", "a", "--goal", "1"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.budgetUsd).toBeGreaterThan(0);
  });

  it("requires a name", () => {
    const r = parseDeptAddArgs(["--worker", "a", "--goal", "1"]);
    expect(r.ok).toBe(false);
  });

  it("requires at least one worker", () => {
    const r = parseDeptAddArgs(["Growth", "--goal", "1"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/--worker/);
  });

  it("requires at least one goal", () => {
    const r = parseDeptAddArgs(["Growth", "--worker", "a"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/--goal/);
  });

  it("rejects a non-integer goal id", () => {
    const r = parseDeptAddArgs(["Growth", "--worker", "a", "--goal", "x"]);
    expect(r.ok).toBe(false);
  });

  it("rejects a non-positive budget", () => {
    const r = parseDeptAddArgs(["Growth", "--worker", "a", "--goal", "1", "--budget", "0"]);
    expect(r.ok).toBe(false);
  });
});

describe("runDeptWith add", () => {
  it("creates a department owning a worker + goal and sets its dept: budget scope", async () => {
    const h = harness();
    const code = await runDeptWith(["add", "Growth", "--worker", "scout", "--goal", "7", "--budget", "150"], h.deps);
    expect(code).toBe(0);
    expect(h.depts()).toHaveLength(1);
    expect(h.depts()[0]?.id).toBe("growth");
    expect(h.depts()[0]?.workerIds).toEqual(["scout"]);
    expect(h.depts()[0]?.goalIds).toEqual([7]);
    // The budget scope was reused (not duplicated) — a `dept:<id>` budget was set.
    const budget = h.budgets.get("dept:growth");
    expect(budget?.limitUsd).toBe(150);
    expect(h.lines.join("\n")).toMatch(/created growth/);
  });

  it("returns 1 and does not persist on a bad add", async () => {
    const h = harness();
    const code = await runDeptWith(["add", "Growth", "--worker", "scout"], h.deps);
    expect(code).toBe(1);
    expect(h.depts()).toHaveLength(0);
  });
});

describe("runDeptWith list / assign / status", () => {
  const seed = (): Department[] => {
    const r = addDepartment([], { name: "Growth", workerIds: ["a"], goalIds: [1] }, NOW);
    if (!r.ok) throw new Error(r.error);
    return [r.value];
  };

  it("lists departments", async () => {
    const h = harness({ depts: seed() });
    expect(await runDeptWith(["list"], h.deps)).toBe(0);
    expect(h.lines.join("\n")).toMatch(/growth · Growth · 1 worker/);
  });

  it("assigns a worker to a department", async () => {
    const h = harness({ depts: seed() });
    expect(await runDeptWith(["assign", "growth", "b"], h.deps)).toBe(0);
    expect(h.depts()[0]?.workerIds).toEqual(["a", "b"]);
    expect(h.lines.join("\n")).toMatch(/assigned b → growth/);
  });

  it("errors assigning to an unknown department", async () => {
    const h = harness({ depts: seed() });
    expect(await runDeptWith(["assign", "nope", "b"], h.deps)).toBe(1);
  });

  it("shows status: roster, spend-vs-budget, open goals", async () => {
    const h = harness({
      depts: seed(),
      workers: [worker("a"), worker("z")],
      goals: [goal(1, "active"), goal(2, "active")],
    });
    h.budgets.set("dept:growth", {
      scope: "dept:growth", limitUsd: 100, warnFraction: 0.8, spentUsd: 25, status: "active", updatedAt: NOW.toISOString(),
    });
    expect(await runDeptWith(["status"], h.deps)).toBe(0);
    const out = h.lines.join("\n");
    expect(out).toMatch(/growth · Growth/);
    expect(out).toMatch(/a · eng · idle/); // bound worker shown
    expect(out).not.toMatch(/^\s+z ·/m); // unbound worker excluded
    expect(out).toMatch(/\$25 \/ \$100 spent · \$75 left · active/);
    expect(out).toMatch(/#1 goal 1/); // owned + active goal open
    expect(out).not.toMatch(/#2 goal 2/); // goal 2 not owned by dept
  });

  it("errors on status for an unknown department", async () => {
    const h = harness({ depts: seed() });
    expect(await runDeptWith(["status", "nope"], h.deps)).toBe(1);
  });

  it("prints usage on an unknown subcommand", async () => {
    const h = harness();
    expect(await runDeptWith(["wat"], h.deps)).toBe(1);
    expect(h.lines.join("\n")).toMatch(/usage:/);
  });
});

describe("formatDeptStatus", () => {
  it("renders unset budget and empty roster/goals", () => {
    const r = addDepartment([], { name: "Growth", workerIds: ["a"], goalIds: [1] }, NOW);
    if (!r.ok) throw new Error(r.error);
    const view = departmentStatus(r.value, { budget: null, workers: [], goals: [] });
    const text = formatDeptStatus(view);
    expect(text).toMatch(/budget: \(unset\)/);
    expect(text).toMatch(/\(no workers bound\)/);
    expect(text).toMatch(/\(no open goals\)/);
  });
});
