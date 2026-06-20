// COFOUNDER-CADENCE-LOOP — the company operating-cadence loop. One `tick`
// advances AT MOST ONE task in each department that has both open standing goals
// and remaining budget, and records a per-department beat summary. The
// orchestration is PURE/injectable: every read (departments, open goals, next
// task, remaining budget) and the dispatch side effect are supplied via `deps`,
// so the loop is fully unit-tested without a kernel, a budget store, or real
// task dispatch. Designed to be cron/heartbeat-invoked.

/** Why a department's beat happened the way it did. One stable code per outcome. */
export type BeatReason = "dispatched" | "no-open-goals" | "no-budget" | "no-task" | "dispatch-failed";

/** A single department's outcome for one company tick. */
export type CompanyBeat = {
  departmentId: string;
  /** True iff exactly one task was dispatched for this department this tick. */
  dispatched: boolean;
  reason: BeatReason;
  /** The dispatched task's identity, when one was dispatched. */
  taskId?: string;
  /** Present only when reason === "dispatch-failed". */
  error?: string;
};

/** The whole-company result of one tick: one beat per department, in list order. */
export type CompanyTickResult = {
  beats: CompanyBeat[];
  /** Count of departments that dispatched a task (always ≤ departments). */
  dispatched: number;
  at: string;
};

/** A department identity the cadence loop iterates over. Minimal by design. */
export type CadenceDepartment = { id: string };

/** A dispatchable unit of work for a department. Carries an id for the beat. */
export type CadenceTask = { id: string };

export type DispatchOutcome = { ok: true } | { ok: false; error: string };

/**
 * Injected ports for one company tick. Every department read and the dispatch
 * side effect is a dependency so `runCompanyTick` stays pure orchestration.
 */
export type CompanyTickDeps = {
  /** All departments to advance this tick, in the order beats are reported. */
  listDepartments: () => Promise<CadenceDepartment[]>;
  /** The department's still-open standing goal ids (empty → nothing to advance). */
  openGoalsFor: (dept: CadenceDepartment) => Promise<number[]>;
  /** The single next task to advance for the department, or null when none is queued. */
  nextTaskFor: (dept: CadenceDepartment) => Promise<CadenceTask | null>;
  /** USD left in the department's budget scope; null = unbounded (treated as available). */
  remainingBudgetFor: (dept: CadenceDepartment) => Promise<number | null>;
  /** Advance exactly one task for the department. Errors-as-values. */
  dispatch: (dept: CadenceDepartment, task: CadenceTask) => Promise<DispatchOutcome>;
  now: () => Date;
};

/** True when the scope still has spend headroom. null limit = unbounded → always true. Pure. */
function hasBudget(remaining: number | null): boolean {
  return remaining === null || remaining > 0;
}

/**
 * Decide and (when warranted) advance ONE task for a single department. Returns
 * the beat. A department dispatches iff it has open goals AND remaining budget>0
 * AND a queued next task; otherwise it skips with a reason. At most one dispatch.
 */
async function advanceDepartment(dept: CadenceDepartment, deps: CompanyTickDeps): Promise<CompanyBeat> {
  const openGoals = await deps.openGoalsFor(dept);
  if (openGoals.length === 0) return { departmentId: dept.id, dispatched: false, reason: "no-open-goals" };

  const remaining = await deps.remainingBudgetFor(dept);
  if (!hasBudget(remaining)) return { departmentId: dept.id, dispatched: false, reason: "no-budget" };

  const task = await deps.nextTaskFor(dept);
  if (!task) return { departmentId: dept.id, dispatched: false, reason: "no-task" };

  const outcome = await deps.dispatch(dept, task);
  if (!outcome.ok) {
    return { departmentId: dept.id, dispatched: false, reason: "dispatch-failed", taskId: task.id, error: outcome.error };
  }
  return { departmentId: dept.id, dispatched: true, reason: "dispatched", taskId: task.id };
}

/**
 * Advance the whole company by one beat: for every department, advance at most
 * one task when it has open goals AND remaining budget, recording a per-
 * department beat. Pure orchestration over injected `deps`. An empty company →
 * an empty beat list. Departments are advanced independently (one failing
 * dispatch only marks that department's beat `dispatch-failed`).
 */
export async function runCompanyTick(deps: CompanyTickDeps): Promise<CompanyTickResult> {
  const departments = await deps.listDepartments();
  const beats: CompanyBeat[] = [];
  for (const dept of departments) beats.push(await advanceDepartment(dept, deps));
  return {
    beats,
    dispatched: beats.filter((b) => b.dispatched).length,
    at: deps.now().toISOString(),
  };
}
