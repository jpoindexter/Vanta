import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import type { Worker } from "../team/store.js";
import type { Budget } from "../budget/types.js";
import { remainingUsd } from "../budget/types.js";
import type { Goal } from "../types.js";

// COFOUNDER-DEPARTMENT-UNIT — a department is a first-class org unit: ONE durable
// entity that owns a worker roster, a scoped budget, a standing goal subset, and
// a default skill bundle. It binds (does not duplicate) the existing primitives:
// workerIds reference team/* workers, budgetScope reuses budget/* (`dept:<id>`),
// goalIds reference the kernel goal ledger. The model + store are pure/injectable;
// status views are computed against injected budget/worker/goal snapshots.

export const DepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Worker ids bound from the team roster. */
  workerIds: z.array(z.string()).default([]),
  /** Budget scope key — always `dept:<id>`, reusing budget/store. */
  budgetScope: z.string().min(1),
  /** Standing goal ids — a subset of the kernel goal ledger. */
  goalIds: z.array(z.number()).default([]),
  /** Default skill bundle slugs the department's work pulls in. */
  skillIds: z.array(z.string()).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type Department = z.infer<typeof DepartmentSchema>;

export type DeptResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Budget scope key for a department id. The single source of the `dept:` convention. */
export function departmentBudgetScope(id: string): string {
  return `dept:${id}`;
}

/** Lowercase kebab slug of a department name, e.g. "Growth Team" → "growth-team". Pure. */
export function slugifyDepartment(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Derive a stable, unique department id, appending a counter when taken. Pure. */
export function deriveDepartmentId(existing: Department[], name: string): string {
  const base = slugifyDepartment(name) || "department";
  const taken = new Set(existing.map((d) => d.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export type AddDepartmentSpec = {
  name: string;
  /** At least one worker the department owns (done-criterion: owns >=1 worker). */
  workerIds: string[];
  /** At least one standing goal id the department owns. */
  goalIds: number[];
  skillIds?: string[];
};

/**
 * Create a department owning >=1 worker, a `dept:<id>` budget scope, and >=1
 * standing goal. Pure — the caller persists the result (and sets the budget
 * limit against `value.budgetScope`). Errors-as-values.
 */
export function addDepartment(
  existing: Department[],
  spec: AddDepartmentSpec,
  now: Date = new Date(),
): DeptResult<Department> {
  const name = spec.name.trim();
  if (!name) return { ok: false, error: "name is required" };

  const workerIds = dedupe(spec.workerIds.map((w) => w.trim()).filter(Boolean));
  if (workerIds.length === 0) return { ok: false, error: "a department must own at least one worker" };

  const goalIds = dedupeNumbers(spec.goalIds);
  if (goalIds.length === 0) return { ok: false, error: "a department must own at least one standing goal" };

  const id = deriveDepartmentId(existing, name);
  const iso = now.toISOString();
  const dept: Department = {
    id,
    name,
    workerIds,
    budgetScope: departmentBudgetScope(id),
    goalIds,
    skillIds: dedupe((spec.skillIds ?? []).map((s) => s.trim()).filter(Boolean)),
    createdAt: iso,
    updatedAt: iso,
  };
  return { ok: true, value: dept };
}

/** Find a department by id in a list. Pure. */
export function getDepartment(list: Department[], id: string): Department | undefined {
  return list.find((d) => d.id === id);
}

/** All departments, name-sorted. Pure. */
export function listDepartmentsSorted(list: Department[]): Department[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Bind a worker id to a department (idempotent — re-adding is a no-op).
 * Returns the updated list. Pure. Errors when the department is unknown.
 */
export function assignWorker(
  list: Department[],
  deptId: string,
  workerId: string,
  now: Date = new Date(),
): DeptResult<Department[]> {
  const id = workerId.trim();
  if (!id) return { ok: false, error: "workerId is required" };
  const dept = getDepartment(list, deptId);
  if (!dept) return { ok: false, error: `unknown department "${deptId}"` };
  if (dept.workerIds.includes(id)) return { ok: true, value: list };
  return { ok: true, value: patchDept(list, deptId, { workerIds: [...dept.workerIds, id] }, now) };
}

/**
 * Add a standing goal id to a department's owned subset (idempotent).
 * Returns the updated list. Pure. Errors when the department is unknown.
 */
export function setDepartmentGoal(
  list: Department[],
  deptId: string,
  goalId: number,
  now: Date = new Date(),
): DeptResult<Department[]> {
  const dept = getDepartment(list, deptId);
  if (!dept) return { ok: false, error: `unknown department "${deptId}"` };
  if (dept.goalIds.includes(goalId)) return { ok: true, value: list };
  return { ok: true, value: patchDept(list, deptId, { goalIds: [...dept.goalIds, goalId] }, now) };
}

/** Apply a partial patch to one department, bumping updatedAt. Pure. */
function patchDept(list: Department[], deptId: string, patch: Partial<Department>, now: Date): Department[] {
  return list.map((d) => (d.id === deptId ? { ...d, ...patch, updatedAt: now.toISOString() } : d));
}

// ---- Status view (pure) ----

export type DepartmentStatusInputs = {
  /** The scope's budget, or null when none is set. */
  budget: Budget | null;
  /** Latest workers (deduped) — only those in the department are surfaced. */
  workers: Worker[];
  /** Live goals — only the department's owned, still-active ones count as open. */
  goals: Goal[];
};

export type DepartmentStatus = {
  id: string;
  name: string;
  roster: Worker[];
  budgetScope: string;
  limitUsd: number | null;
  spentUsd: number;
  remainingUsd: number | null;
  budgetStatus: Budget["status"] | "unset";
  openGoals: Goal[];
};

/**
 * Compute a department's status view: its bound roster, spend-vs-budget, and open
 * (still-active) goals. Pure — caller supplies the budget/worker/goal snapshots.
 */
export function departmentStatus(dept: Department, inputs: DepartmentStatusInputs): DepartmentStatus {
  const owned = new Set(dept.workerIds);
  const roster = inputs.workers.filter((w) => owned.has(w.id));

  const ownedGoals = new Set(dept.goalIds);
  const openGoals = inputs.goals.filter((g) => ownedGoals.has(g.id) && g.status === "active");

  const budget = inputs.budget;
  return {
    id: dept.id,
    name: dept.name,
    roster,
    budgetScope: dept.budgetScope,
    limitUsd: budget ? budget.limitUsd : null,
    spentUsd: budget ? budget.spentUsd : 0,
    remainingUsd: budget ? remainingUsd(budget) : null,
    budgetStatus: budget ? budget.status : "unset",
    openGoals,
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

// ---- Store (~/.vanta/departments.json, tolerant reader, injected fs) ----

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  departments: z.array(z.unknown()).default([]),
});

export type DeptStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: DeptStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function departmentsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "departments.json");
}

/**
 * Read all departments. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readDepartments(
  env: NodeJS.ProcessEnv = process.env,
  fs: DeptStoreFs = realFs,
): Promise<Department[]> {
  let raw: string;
  try {
    raw = await fs.readFile(departmentsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: Department[] = [];
  for (const row of parsed.departments) {
    const ok = DepartmentSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full department list, latest-wins. */
export async function writeDepartments(
  list: Department[],
  env: NodeJS.ProcessEnv = process.env,
  fs: DeptStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(departmentsPath(env), `${JSON.stringify({ version: 1, departments: list }, null, 2)}\n`);
}
