import { describe, it, expect } from "vitest";
import {
  addDepartment,
  assignWorker,
  departmentBudgetScope,
  departmentStatus,
  deriveDepartmentId,
  getDepartment,
  listDepartmentsSorted,
  readDepartments,
  setDepartmentGoal,
  slugifyDepartment,
  writeDepartments,
  type Department,
  type DeptStoreFs,
} from "./department.js";
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

function budget(scope: string, limitUsd: number, spentUsd: number): Budget {
  return {
    scope,
    limitUsd,
    warnFraction: 0.8,
    spentUsd,
    status: spentUsd >= limitUsd ? "exceeded" : "active",
    updatedAt: NOW.toISOString(),
  };
}

describe("slugifyDepartment / deriveDepartmentId", () => {
  it("slugifies a name to kebab-case", () => {
    expect(slugifyDepartment("Growth Team!")).toBe("growth-team");
  });

  it("derives a unique id when the slug is taken", () => {
    const first = addDepartment([], { name: "Growth", workerIds: ["w1"], goalIds: [1] }, NOW);
    if (!first.ok) throw new Error(first.error);
    expect(deriveDepartmentId([first.value], "Growth")).toBe("growth-2");
  });
});

describe("addDepartment", () => {
  it("creates a dept owning a worker, a dept: budget scope, and a goal", () => {
    const r = addDepartment([], { name: "Growth", workerIds: ["scout"], goalIds: [7] }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("growth");
    expect(r.value.workerIds).toEqual(["scout"]);
    expect(r.value.budgetScope).toBe(departmentBudgetScope("growth"));
    expect(r.value.budgetScope).toBe("dept:growth");
    expect(r.value.goalIds).toEqual([7]);
    expect(r.value.createdAt).toBe(NOW.toISOString());
  });

  it("rejects a department with no worker", () => {
    const r = addDepartment([], { name: "Growth", workerIds: [], goalIds: [1] }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/at least one worker/);
  });

  it("rejects a department with no standing goal", () => {
    const r = addDepartment([], { name: "Growth", workerIds: ["w1"], goalIds: [] }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/at least one standing goal/);
  });

  it("rejects a blank name", () => {
    const r = addDepartment([], { name: "   ", workerIds: ["w1"], goalIds: [1] }, NOW);
    expect(r.ok).toBe(false);
  });

  it("dedupes workers, goals, and skills", () => {
    const r = addDepartment(
      [],
      { name: "Growth", workerIds: ["a", "a", "b"], goalIds: [1, 1, 2], skillIds: ["s", "s"] },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.workerIds).toEqual(["a", "b"]);
    expect(r.value.goalIds).toEqual([1, 2]);
    expect(r.value.skillIds).toEqual(["s"]);
  });
});

describe("assignWorker / setDepartmentGoal", () => {
  const seed = (): Department[] => {
    const r = addDepartment([], { name: "Growth", workerIds: ["a"], goalIds: [1] }, NOW);
    if (!r.ok) throw new Error(r.error);
    return [r.value];
  };

  it("binds a new worker to a department", () => {
    const r = assignWorker(seed(), "growth", "b", NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getDepartment(r.value, "growth")?.workerIds).toEqual(["a", "b"]);
  });

  it("is idempotent when re-assigning the same worker", () => {
    const r = assignWorker(seed(), "growth", "a", NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getDepartment(r.value, "growth")?.workerIds).toEqual(["a"]);
  });

  it("errors on an unknown department", () => {
    const r = assignWorker(seed(), "nope", "b", NOW);
    expect(r.ok).toBe(false);
  });

  it("adds a standing goal to a department's subset", () => {
    const r = setDepartmentGoal(seed(), "growth", 9, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getDepartment(r.value, "growth")?.goalIds).toEqual([1, 9]);
  });
});

describe("listDepartmentsSorted", () => {
  it("sorts by name", () => {
    const a = addDepartment([], { name: "Zeta", workerIds: ["w"], goalIds: [1] }, NOW);
    const b = addDepartment([], { name: "Alpha", workerIds: ["w"], goalIds: [2] }, NOW);
    if (!a.ok || !b.ok) throw new Error("seed failed");
    expect(listDepartmentsSorted([a.value, b.value]).map((d) => d.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("departmentStatus", () => {
  const dept = (() => {
    const r = addDepartment([], { name: "Growth", workerIds: ["a", "b"], goalIds: [1, 2] }, NOW);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  })();

  it("computes roster, spend-vs-budget, and open goals", () => {
    const status = departmentStatus(dept, {
      budget: budget("dept:growth", 100, 30),
      workers: [worker("a"), worker("b"), worker("c")],
      goals: [goal(1, "active"), goal(2, "done"), goal(3, "active")],
    });
    // Roster is only the department's bound workers (c excluded).
    expect(status.roster.map((w) => w.id)).toEqual(["a", "b"]);
    // Spend-vs-budget surfaced from the injected budget.
    expect(status.limitUsd).toBe(100);
    expect(status.spentUsd).toBe(30);
    expect(status.remainingUsd).toBe(70);
    expect(status.budgetStatus).toBe("active");
    // Open = owned AND still active (goal 2 is done, goal 3 isn't owned).
    expect(status.openGoals.map((g) => g.id)).toEqual([1]);
  });

  it("reports unset budget when no budget exists for the scope", () => {
    const status = departmentStatus(dept, { budget: null, workers: [], goals: [] });
    expect(status.limitUsd).toBeNull();
    expect(status.spentUsd).toBe(0);
    expect(status.remainingUsd).toBeNull();
    expect(status.budgetStatus).toBe("unset");
  });

  it("reflects an exceeded budget", () => {
    const status = departmentStatus(dept, {
      budget: budget("dept:growth", 50, 50),
      workers: [],
      goals: [],
    });
    expect(status.budgetStatus).toBe("exceeded");
    expect(status.remainingUsd).toBe(0);
  });
});

describe("store (injected fs)", () => {
  function fakeFs(initial?: string): { fs: DeptStoreFs; files: Map<string, string> } {
    const files = new Map<string, string>();
    if (initial !== undefined) files.set("DEPTS", initial);
    const fs: DeptStoreFs = {
      readFile: async (path) => {
        const key = path.endsWith("departments.json") ? "DEPTS" : path;
        if (!files.has(key)) throw new Error("ENOENT");
        return files.get(key)!;
      },
      writeFile: async (path, data) => {
        files.set(path.endsWith("departments.json") ? "DEPTS" : path, data);
      },
      mkdir: async () => {},
    };
    return { fs, files };
  }

  const env = { VANTA_HOME: "/tmp/vanta-test-home" } as unknown as NodeJS.ProcessEnv;

  it("round-trips departments through the store", async () => {
    const { fs } = fakeFs();
    const r = addDepartment([], { name: "Growth", workerIds: ["a"], goalIds: [1] }, NOW);
    if (!r.ok) throw new Error(r.error);
    await writeDepartments([r.value], env, fs);
    const read = await readDepartments(env, fs);
    expect(read).toHaveLength(1);
    expect(read[0]?.id).toBe("growth");
    expect(read[0]?.budgetScope).toBe("dept:growth");
  });

  it("returns [] when the file is missing (tolerant)", async () => {
    const { fs } = fakeFs();
    expect(await readDepartments(env, fs)).toEqual([]);
  });

  it("returns [] when the file is corrupt JSON (tolerant)", async () => {
    const { fs } = fakeFs("{ not json");
    expect(await readDepartments(env, fs)).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones (tolerant)", async () => {
    const valid = addDepartment([], { name: "Growth", workerIds: ["a"], goalIds: [1] }, NOW);
    if (!valid.ok) throw new Error(valid.error);
    const raw = JSON.stringify({
      version: 1,
      departments: [valid.value, { id: "broken" /* missing required fields */ }, 42],
    });
    const { fs } = fakeFs(raw);
    const read = await readDepartments(env, fs);
    expect(read.map((d) => d.id)).toEqual(["growth"]);
  });
});
