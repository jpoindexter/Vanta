import { describe, expect, it, vi } from "vitest";
import { formatCompanyTick, handleCompanyTick, type CompanyDeps } from "./company-cmd.js";
import type { CadenceDepartment, CadenceTask, CompanyTickResult, DispatchOutcome } from "../cofounder/cadence.js";

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
