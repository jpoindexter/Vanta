import { describe, it, expect } from "vitest";
import { handleOrg, formatTemplateSummary, type OrgDeps } from "./org-cmd.js";
import type { CompanyTemplate } from "../cofounder/company-template.js";
import { TEMPLATE_VERSION } from "../cofounder/company-template.js";
import type { Department } from "../cofounder/department.js";
import type { Budget } from "../budget/types.js";

const NOW = "2026-06-20T12:00:00.000Z";

function dept(id: string, skillIds: string[] = []): Department {
  return {
    id,
    name: id,
    workerIds: [`${id}-worker`],
    budgetScope: `dept:${id}`,
    goalIds: [1],
    skillIds,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function budget(scope: string): Budget {
  return { scope, limitUsd: 50, warnFraction: 0.8, spentUsd: 0, status: "active", updatedAt: NOW };
}

/** A deps harness with an in-memory "filesystem" + captured log + import sinks. */
function harness() {
  const files = new Map<string, string>();
  const written = { departments: [] as Department[], budgets: [] as Budget[], goals: [] as { text: string; status: "active" | "done" }[] };
  const logs: string[] = [];
  const deps: OrgDeps = {
    export: {
      readDepartments: async () => [dept("growth", ["gtm-builder"])],
      readBudgets: async () => [budget("dept:growth")],
      readGoals: async () => [{ text: "ship v1", status: "active" }],
    },
    import: {
      writeDepartments: async (l) => void (written.departments = l),
      writeBudgets: async (l) => void (written.budgets = l),
      writeGoals: async (l) => void (written.goals = l),
    },
    readTemplateFile: async (p) => {
      const f = files.get(p);
      if (f === undefined) throw new Error(`no such file: ${p}`);
      return f;
    },
    writeTemplateFile: async (p, d) => void files.set(p, d),
    log: (line) => void logs.push(line),
  };
  return { deps, files, written, logs };
}

describe("formatTemplateSummary", () => {
  it("counts departments, budgets, goals, and skill bindings", () => {
    const t: CompanyTemplate = {
      version: TEMPLATE_VERSION,
      departments: [dept("a"), dept("b")],
      budgets: [budget("dept:a")],
      goals: [{ text: "g", status: "active" }],
      skillBindings: [
        { departmentId: "a", skillIds: ["x", "y"] },
        { departmentId: "b", skillIds: [] },
      ],
    };
    expect(formatTemplateSummary(t)).toBe("v1 · 2 department(s) · 1 budget(s) · 1 goal(s) · 2 skill binding(s)");
  });
});

describe("handleOrg export", () => {
  it("writes a scrubbed template file and returns 0", async () => {
    const { deps, files, logs } = harness();
    const code = await handleOrg(["export", "out.json"], deps);
    expect(code).toBe(0);
    const raw = files.get("out.json");
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw as string) as CompanyTemplate;
    expect(parsed.departments.map((d) => d.id)).toEqual(["growth"]);
    expect(parsed.skillBindings).toEqual([{ departmentId: "growth", skillIds: ["gtm-builder"] }]);
    expect(logs.join("\n")).toContain("exported out.json");
  });

  it("reports a writer failure and returns 1", async () => {
    const { deps, logs } = harness();
    deps.writeTemplateFile = async () => {
      throw new Error("disk full");
    };
    const code = await handleOrg(["export", "out.json"], deps);
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("disk full");
  });

  it("requires a file path", async () => {
    const { deps, logs } = harness();
    const code = await handleOrg(["export"], deps);
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("export needs a file path");
  });
});

describe("handleOrg import", () => {
  it("rehydrates a template file into the data dir and returns 0", async () => {
    const { deps, written } = harness();
    // Round-trip: export to a file, then import that same file.
    await handleOrg(["export", "org.json"], deps);
    const code = await handleOrg(["import", "org.json"], deps);
    expect(code).toBe(0);
    expect(written.departments.map((d) => d.id)).toEqual(["growth"]);
    expect(written.budgets.map((b) => b.scope)).toEqual(["dept:growth"]);
    expect(written.goals).toEqual([{ text: "ship v1", status: "active" }]);
  });

  it("reports a missing file and returns 1", async () => {
    const { deps, logs } = harness();
    const code = await handleOrg(["import", "nope.json"], deps);
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("failed reading template");
  });

  it("rejects non-JSON content and returns 1", async () => {
    const { deps, files, logs } = harness();
    files.set("bad.json", "not json {");
    const code = await handleOrg(["import", "bad.json"], deps);
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("not valid JSON");
  });

  it("rejects a malformed template and returns 1", async () => {
    const { deps, files, logs } = harness();
    files.set("malformed.json", JSON.stringify({ version: 1, departments: "nope" }));
    const code = await handleOrg(["import", "malformed.json"], deps);
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("invalid company template");
  });
});

describe("handleOrg usage", () => {
  it("prints usage and returns 0 with no subcommand", async () => {
    const { deps, logs } = harness();
    const code = await handleOrg([], deps);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("vanta org export");
  });

  it("prints usage and returns 1 on an unknown subcommand", async () => {
    const { deps, logs } = harness();
    const code = await handleOrg(["frobnicate"], deps);
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("usage:");
  });
});
