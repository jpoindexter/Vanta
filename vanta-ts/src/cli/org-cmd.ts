import {
  exportCompany,
  importCompany,
  type CompanyTemplate,
  type ExportDeps,
  type ImportDeps,
} from "../cofounder/company-template.js";

// `vanta org export <file>` / `vanta org import <file>` — portable, secret-scrubbed
// company templates. Export serializes departments + budgets + standing goals +
// skill bindings to a JSON file; import rehydrates one into a fresh data dir,
// reproducing the same org structure. `handleOrg` is PURE over injected deps + a
// `log` sink so the whole surface is unit-tested without real I/O; `runOrgCommand`
// assembles the live deps. NOT wired into cli.ts/ops.ts here.

export type OrgDeps = {
  export: ExportDeps;
  import: ImportDeps;
  /** Read a template JSON file's raw text. */
  readTemplateFile: (path: string) => Promise<string>;
  /** Write the serialized template to a file. */
  writeTemplateFile: (path: string, data: string) => Promise<void>;
  log: (line: string) => void;
};

const USAGE = [
  "usage:",
  "  vanta org export <file>   write a secret-scrubbed company template",
  "  vanta org import <file>   rehydrate a company template into this data dir",
].join("\n");

/** Render a one-line summary of an exported/imported template. Pure. */
export function formatTemplateSummary(template: CompanyTemplate): string {
  const skillCount = template.skillBindings.reduce((n, b) => n + b.skillIds.length, 0);
  return (
    `v${template.version} · ${template.departments.length} department(s) · ` +
    `${template.budgets.length} budget(s) · ${template.goals.length} goal(s) · ${skillCount} skill binding(s)`
  );
}

/** `org export <file>` — serialize the live org to a scrubbed template file. */
async function handleExport(file: string, deps: OrgDeps): Promise<number> {
  const result = await exportCompany(deps.export);
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  try {
    await deps.writeTemplateFile(file, `${JSON.stringify(result.value, null, 2)}\n`);
  } catch (err) {
    deps.log(`failed writing template to ${file}: ${(err as Error).message}`);
    return 1;
  }
  deps.log(`exported ${file} · ${formatTemplateSummary(result.value)}`);
  return 0;
}

/** `org import <file>` — rehydrate a template file into this data dir. */
async function handleImport(file: string, deps: OrgDeps): Promise<number> {
  let raw: string;
  try {
    raw = await deps.readTemplateFile(file);
  } catch (err) {
    deps.log(`failed reading template from ${file}: ${(err as Error).message}`);
    return 1;
  }
  let template: unknown;
  try {
    template = JSON.parse(raw);
  } catch {
    deps.log(`${file} is not valid JSON`);
    return 1;
  }
  const result = await importCompany(template, deps.import);
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  deps.log(`imported ${file} · ${formatTemplateSummary(result.value)}`);
  return 0;
}

/** Dispatch a parsed `vanta org <sub> <file>` against injected deps. Pure orchestration. */
export async function handleOrg(rest: string[], deps: OrgDeps): Promise<number> {
  const [sub, file] = rest;
  switch (sub) {
    case "export":
    case "import": {
      if (file === undefined) {
        deps.log(`${sub} needs a file path\n${USAGE}`);
        return 1;
      }
      return sub === "export" ? handleExport(file, deps) : handleImport(file, deps);
    }
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/** Build live deps: org state from `~/.vanta` + project `.vanta/`, files via fs, goals from the kernel. */
async function liveOrgDeps(root: string): Promise<OrgDeps> {
  const { join } = await import("node:path");
  const { readFile, writeFile } = await import("node:fs/promises");
  const { readDepartments, writeDepartments } = await import("../cofounder/department.js");
  const { listBudgets, saveBudget } = await import("../budget/store.js");
  const { createKernelClient } = await import("../kernel/client.js");
  const { ensureKernel } = await import("../kernel-launcher.js");
  const { kernelBinaryPath } = await import("../kernel/path.js");
  const dataDir = join(root, ".vanta");
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  await ensureKernel({ baseUrl, kernelBin: kernelBinaryPath(root), root });
  const kernel = createKernelClient(baseUrl);
  return {
    export: {
      readDepartments: () => readDepartments(),
      readBudgets: () => listBudgets(dataDir),
      readGoals: async () => (await kernel.getGoals()).map((g) => ({ text: g.text, status: g.status })),
    },
    import: {
      writeDepartments: (list) => writeDepartments(list),
      writeBudgets: async (list) => {
        for (const b of list) await saveBudget(dataDir, b);
      },
      writeGoals: async (list) => {
        for (const g of list) await kernel.addGoal(g.text);
      },
    },
    readTemplateFile: (path) => readFile(path, "utf8"),
    writeTemplateFile: (path, data) => writeFile(path, data, "utf8"),
    log: (line) => console.log(line),
  };
}

export async function runOrgCommand(rest: string[]): Promise<number> {
  const root = process.env.VANTA_ROOT?.trim() || process.cwd();
  return handleOrg(rest, await liveOrgDeps(root));
}
