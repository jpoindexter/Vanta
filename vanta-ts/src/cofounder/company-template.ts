import { z } from "zod";
import { redactSecrets } from "../store/secret-scan.js";
import { DepartmentSchema, type Department } from "./department.js";
import { BudgetSchema, type Budget } from "../budget/types.js";

// COFOUNDER-COMPANY-TEMPLATE — a portable, secret-scrubbed snapshot of a company:
// its departments, scoped budgets, standing goals, and the skill bindings each
// department pulls in. `vanta org export` serializes this; `vanta org import`
// rehydrates it into a fresh data dir, reproducing the same org structure.
//
// serialize/scrub/rehydrate are PURE and injectable: export injects the readers,
// import injects the writers, and `scrubTemplate` is a side-effect-free pass that
// strips any secret-shaped string value (reusing the existing redactor) so a
// template is safe to share. Errors-as-values; an empty org is tolerated.

export const TEMPLATE_VERSION = 1 as const;

/** One department's standing goals, carried by text so they rehydrate without depending on volatile kernel goal ids. */
export const TemplateGoalSchema = z.object({
  text: z.string().min(1),
  status: z.enum(["active", "done"]).default("active"),
});
export type TemplateGoal = z.infer<typeof TemplateGoalSchema>;

/** A department's default skill bundle, keyed by department id. */
export const SkillBindingSchema = z.object({
  departmentId: z.string().min(1),
  skillIds: z.array(z.string()).default([]),
});
export type SkillBinding = z.infer<typeof SkillBindingSchema>;

export const CompanyTemplateSchema = z.object({
  version: z.literal(TEMPLATE_VERSION).default(TEMPLATE_VERSION),
  departments: z.array(DepartmentSchema).default([]),
  budgets: z.array(BudgetSchema).default([]),
  goals: z.array(TemplateGoalSchema).default([]),
  skillBindings: z.array(SkillBindingSchema).default([]),
});
export type CompanyTemplate = z.infer<typeof CompanyTemplateSchema>;

export type TemplateResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Readers injected into `exportCompany` — all org state comes through these. */
export type ExportDeps = {
  readDepartments: () => Promise<Department[]>;
  readBudgets: () => Promise<Budget[]>;
  readGoals: () => Promise<TemplateGoal[]>;
};

/** Writers injected into `importCompany` — rehydration writes only through these. */
export type ImportDeps = {
  writeDepartments: (list: Department[]) => Promise<void>;
  writeBudgets: (list: Budget[]) => Promise<void>;
  writeGoals: (list: TemplateGoal[]) => Promise<void>;
};

/** Strip secret-shaped substrings from a string field, preserving the rest. Pure. */
function scrubString(value: string): string {
  return redactSecrets(value);
}

/** Scrub a department's free-text fields (name) in place-of-copy. Pure. */
function scrubDepartment(dept: Department): Department {
  return { ...dept, name: scrubString(dept.name) };
}

/** Scrub a budget's opaque scope key (where a stray secret could be embedded). Pure. */
function scrubBudget(budget: Budget): Budget {
  const scrubbed: Budget = { ...budget, scope: scrubString(budget.scope) };
  if (budget.pauseReason !== undefined) scrubbed.pauseReason = scrubString(budget.pauseReason);
  return scrubbed;
}

/** Scrub a goal's text. Pure. */
function scrubGoal(goal: TemplateGoal): TemplateGoal {
  return { ...goal, text: scrubString(goal.text) };
}

/**
 * Return a copy of the template with every secret-shaped string value redacted.
 * Pure — no I/O. Idempotent: re-scrubbing a clean template is a no-op, so an
 * export→import→export round-trip is stable modulo the (already-removed) secrets.
 */
export function scrubTemplate(template: CompanyTemplate): CompanyTemplate {
  return {
    version: template.version,
    departments: template.departments.map(scrubDepartment),
    budgets: template.budgets.map(scrubBudget),
    goals: template.goals.map(scrubGoal),
    skillBindings: template.skillBindings.map((b) => ({ ...b })),
  };
}

/** Derive each department's skill binding from its `skillIds`. Pure. */
function deriveSkillBindings(departments: Department[]): SkillBinding[] {
  return departments.map((d) => ({ departmentId: d.id, skillIds: [...d.skillIds] }));
}

/**
 * Serialize the live org into a secret-scrubbed, portable template: departments +
 * scoped budgets + standing goals + per-department skill bindings. Reads only
 * through injected deps; the result is `scrubTemplate`'d so it is safe to share.
 * Errors-as-values — a reader failure is reported, not thrown.
 */
export async function exportCompany(deps: ExportDeps): Promise<TemplateResult<CompanyTemplate>> {
  let departments: Department[];
  let budgets: Budget[];
  let goals: TemplateGoal[];
  try {
    [departments, budgets, goals] = await Promise.all([
      deps.readDepartments(),
      deps.readBudgets(),
      deps.readGoals(),
    ]);
  } catch (err) {
    return { ok: false, error: `export failed reading org state: ${(err as Error).message}` };
  }
  const template: CompanyTemplate = {
    version: TEMPLATE_VERSION,
    departments,
    budgets,
    goals,
    skillBindings: deriveSkillBindings(departments),
  };
  return { ok: true, value: scrubTemplate(template) };
}

/**
 * Rehydrate a template into a fresh data dir, reproducing the same org structure:
 * departments, budgets, and standing goals are written through injected writers.
 * The template is validated (zod boundary) and re-scrubbed defensively before any
 * write, so importing an untrusted template can never persist a secret-shaped
 * value. Errors-as-values.
 */
export async function importCompany(
  template: unknown,
  deps: ImportDeps,
): Promise<TemplateResult<CompanyTemplate>> {
  const parsed = CompanyTemplateSchema.safeParse(template);
  if (!parsed.success) {
    return { ok: false, error: `invalid company template: ${parsed.error.issues[0]?.message ?? "malformed"}` };
  }
  const clean = scrubTemplate(parsed.data);
  try {
    await deps.writeDepartments(clean.departments);
    await deps.writeBudgets(clean.budgets);
    await deps.writeGoals(clean.goals);
  } catch (err) {
    return { ok: false, error: `import failed writing org state: ${(err as Error).message}` };
  }
  return { ok: true, value: clean };
}
