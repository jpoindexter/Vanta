import { describe, it, expect } from "vitest";
import {
  exportCompany,
  importCompany,
  scrubTemplate,
  TEMPLATE_VERSION,
  type CompanyTemplate,
  type ExportDeps,
  type ImportDeps,
  type TemplateGoal,
} from "./company-template.js";
import type { Department } from "./department.js";
import type { Budget } from "../budget/types.js";

const NOW = "2026-06-20T12:00:00.000Z";

function dept(id: string, name = id, skillIds: string[] = []): Department {
  return {
    id,
    name,
    workerIds: [`${id}-worker`],
    budgetScope: `dept:${id}`,
    goalIds: [1],
    skillIds,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function budget(scope: string, limitUsd = 50): Budget {
  return { scope, limitUsd, warnFraction: 0.8, spentUsd: 0, status: "active", updatedAt: NOW };
}

function goal(text: string, status: TemplateGoal["status"] = "active"): TemplateGoal {
  return { text, status };
}

/** Build injectable export deps from fixed snapshots. */
function exportDeps(over: Partial<{ departments: Department[]; budgets: Budget[]; goals: TemplateGoal[] }> = {}): ExportDeps {
  return {
    readDepartments: async () => over.departments ?? [dept("growth", "Growth", ["gtm-builder"])],
    readBudgets: async () => over.budgets ?? [budget("dept:growth")],
    readGoals: async () => over.goals ?? [goal("ship v1")],
  };
}

/** Build injectable import deps that capture what was written. */
function captureImportDeps() {
  const written = { departments: [] as Department[], budgets: [] as Budget[], goals: [] as TemplateGoal[] };
  const deps: ImportDeps = {
    writeDepartments: async (list) => void (written.departments = list),
    writeBudgets: async (list) => void (written.budgets = list),
    writeGoals: async (list) => void (written.goals = list),
  };
  return { deps, written };
}

describe("exportCompany", () => {
  it("serializes departments, budgets, goals, and skill bindings", async () => {
    const result = await exportCompany(exportDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.value;
    expect(t.version).toBe(TEMPLATE_VERSION);
    expect(t.departments.map((d) => d.id)).toEqual(["growth"]);
    expect(t.budgets.map((b) => b.scope)).toEqual(["dept:growth"]);
    expect(t.goals).toEqual([goal("ship v1")]);
    // Skill bindings are derived per-department from skillIds.
    expect(t.skillBindings).toEqual([{ departmentId: "growth", skillIds: ["gtm-builder"] }]);
  });

  it("tolerates an empty org", async () => {
    const result = await exportCompany(exportDeps({ departments: [], budgets: [], goals: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      version: TEMPLATE_VERSION,
      departments: [],
      budgets: [],
      goals: [],
      skillBindings: [],
    });
  });

  it("returns an error value when a reader throws (errors-as-values)", async () => {
    const deps: ExportDeps = {
      readDepartments: async () => {
        throw new Error("disk gone");
      },
      readBudgets: async () => [],
      readGoals: async () => [],
    };
    const result = await exportCompany(deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("disk gone");
  });

  it("scrubs a secret-shaped value out of the exported template", async () => {
    // An OpenAI-shaped key embedded in a goal's text must not survive export.
    const secret = "sk-abcdefghijklmnopqrstuvwx0123456789";
    const deps = exportDeps({
      departments: [dept("eng", `Eng ${secret}`)],
      budgets: [budget(`dept:eng-${secret}`)],
      goals: [goal(`call api with ${secret}`)],
    });
    const result = await exportCompany(deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const blob = JSON.stringify(result.value);
    expect(blob).not.toContain(secret);
    expect(blob).toContain("[REDACTED]");
  });
});

describe("scrubTemplate", () => {
  it("redacts secret-shaped strings and is idempotent", () => {
    const secret = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";
    const template: CompanyTemplate = {
      version: TEMPLATE_VERSION,
      departments: [dept("d", `D ${secret}`)],
      budgets: [budget("dept:d")],
      goals: [goal(`use ${secret}`)],
      skillBindings: [],
    };
    const once = scrubTemplate(template);
    expect(JSON.stringify(once)).not.toContain(secret);
    // Re-scrubbing a clean template changes nothing.
    expect(scrubTemplate(once)).toEqual(once);
  });

  it("leaves a clean template untouched", () => {
    const template: CompanyTemplate = {
      version: TEMPLATE_VERSION,
      departments: [dept("ops", "Ops")],
      budgets: [budget("dept:ops")],
      goals: [goal("keep the lights on")],
      skillBindings: [{ departmentId: "ops", skillIds: [] }],
    };
    expect(scrubTemplate(template)).toEqual(template);
  });
});

describe("importCompany", () => {
  it("rehydrates a template to the same structure", async () => {
    const exported = await exportCompany(exportDeps());
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const { deps, written } = captureImportDeps();
    const result = await importCompany(exported.value, deps);
    expect(result.ok).toBe(true);
    expect(written.departments).toEqual(exported.value.departments);
    expect(written.budgets).toEqual(exported.value.budgets);
    expect(written.goals).toEqual(exported.value.goals);
  });

  it("rejects a malformed template (zod boundary)", async () => {
    const { deps } = captureImportDeps();
    const result = await importCompany({ version: 1, departments: "nope" }, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("invalid company template");
  });

  it("re-scrubs defensively so an untrusted template can't persist a secret", async () => {
    // A deliberately fake AWS-key-shaped fixture, assembled at runtime so no literal key pattern
    // sits in source — keeps the secret-scrubber test meaningful without tripping SAST.
    const secret = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    const dirty: CompanyTemplate = {
      version: TEMPLATE_VERSION,
      departments: [dept("x", `X ${secret}`)],
      budgets: [],
      goals: [goal(`leak ${secret}`)],
      skillBindings: [],
    };
    const { deps, written } = captureImportDeps();
    const result = await importCompany(dirty, deps);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(written.departments)).not.toContain(secret);
    expect(JSON.stringify(written.goals)).not.toContain(secret);
  });

  it("returns an error value when a writer throws", async () => {
    const exported = await exportCompany(exportDeps());
    if (!exported.ok) return;
    const deps: ImportDeps = {
      writeDepartments: async () => {
        throw new Error("read-only fs");
      },
      writeBudgets: async () => {},
      writeGoals: async () => {},
    };
    const result = await importCompany(exported.value, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("read-only fs");
  });
});

describe("round-trip", () => {
  it("export → import → export is stable modulo scrubbed fields", async () => {
    const secret = "sk-ant-abcdefghijklmnopqrstuvwxyz0123";
    const first = await exportCompany(
      exportDeps({
        departments: [dept("growth", "Growth", ["gtm-builder"]), dept("eng", `Eng ${secret}`)],
        budgets: [budget("dept:growth"), budget("dept:eng")],
        goals: [goal("ship v1"), goal(`api ${secret}`, "active")],
      }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Rehydrate, then re-export from the rehydrated state.
    const { deps, written } = captureImportDeps();
    const imported = await importCompany(first.value, deps);
    expect(imported.ok).toBe(true);

    const second = await exportCompany({
      readDepartments: async () => written.departments,
      readBudgets: async () => written.budgets,
      readGoals: async () => written.goals,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Already-scrubbed first export equals the second export exactly.
    expect(second.value).toEqual(first.value);
    expect(JSON.stringify(second.value)).not.toContain(secret);
  });
});
