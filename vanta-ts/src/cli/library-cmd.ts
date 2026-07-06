import {
  byApproval,
  byDepartment,
  bySourceTask,
  listWorkProducts,
  readWorkProducts,
  type WorkProduct,
} from "../cofounder/work-products.js";

// `vanta library list [--dept <id>] [--approved|--pending]` — the company
// Library: a department's completed tasks land as durable, provenance-tagged
// artifacts. The handler + formatter are pure over injected deps, so the whole
// surface is unit-tested without real I/O. Reads work-products from ~/.vanta;
// departmentId references a cofounder/department Department.

export type LibraryDeps = {
  readWorkProducts: () => Promise<WorkProduct[]>;
  log: (line: string) => void;
};

/** Approval filter: all artifacts, only approved, or only pending. */
export type ApprovalFilter = "all" | "approved" | "pending";

export type LibraryListArgs = {
  /** Restrict to one department's artifacts. */
  deptId?: string;
  /** PCLIP-WORK-PRODUCTS: restrict to one task's linked artifacts. */
  taskId?: string;
  approval: ApprovalFilter;
};

const USAGE = [
  "usage:",
  "  vanta library list [--dept <id>] [--task <id>] [--approved|--pending]",
].join("\n");

/** Read the single value following a flag, or undefined. Pure. */
function oneFlag(rest: string[], flag: string): string | undefined {
  const i = rest.indexOf(flag);
  return i === -1 ? undefined : rest[i + 1];
}

/**
 * Parse `vanta library list` args. `--dept <id>` scopes to one department;
 * `--approved` / `--pending` filter by approval state (mutually exclusive).
 * Pure — no I/O. Errors-as-values.
 */
/** Read an id-valued flag; error when present without a usable value. Pure. */
function idFlag(rest: string[], flag: string, what: string): { ok: true; value?: string } | { ok: false; error: string } {
  const v = oneFlag(rest, flag);
  if (rest.includes(flag) && (v === undefined || v.startsWith("--"))) {
    return { ok: false, error: `${flag} needs a ${what}` };
  }
  return { ok: true, value: v?.trim() || undefined };
}

export function parseLibraryListArgs(rest: string[]): { ok: true; value: LibraryListArgs } | { ok: false; error: string } {
  const wantApproved = rest.includes("--approved");
  const wantPending = rest.includes("--pending");
  if (wantApproved && wantPending) {
    return { ok: false, error: "use only one of --approved / --pending" };
  }

  const dept = idFlag(rest, "--dept", "department id");
  if (!dept.ok) return dept;
  const task = idFlag(rest, "--task", "task id");
  if (!task.ok) return task;

  const approval: ApprovalFilter = wantApproved ? "approved" : wantPending ? "pending" : "all";
  return { ok: true, value: { deptId: dept.value, taskId: task.value, approval } };
}

/** Apply department + approval filters, then order newest-first. Pure. */
export function selectWorkProducts(all: WorkProduct[], args: LibraryListArgs): WorkProduct[] {
  let rows = args.deptId ? byDepartment(all, args.deptId) : all;
  if (args.taskId) rows = bySourceTask(rows, args.taskId);
  if (args.approval !== "all") rows = byApproval(rows, args.approval === "approved");
  return listWorkProducts(rows);
}

/** Render one work product as a single text line. Pure. */
export function formatWorkProduct(p: WorkProduct): string {
  const mark = p.approved ? "✔ approved" : "· pending";
  return `${p.id} · ${p.artifact} · ${p.kind} · ${p.departmentId} · by ${p.producedBy} · from ${p.sourceTaskId} · ${mark}`;
}

/** Render the full library listing as text lines (header + rows). Pure. */
export function formatLibrary(rows: WorkProduct[], args: LibraryListArgs): string {
  if (rows.length === 0) {
    const scope = args.deptId ? ` for "${args.deptId}"` : args.taskId ? ` for task "${args.taskId}"` : "";
    const state = args.approval === "all" ? "" : ` (${args.approval})`;
    return `no work products${scope}${state} — completed department tasks land here as artifacts`;
  }
  const header = [
    args.taskId ? `task:${args.taskId}` : args.deptId ? `dept:${args.deptId}` : "all departments",
    args.approval === "all" ? "all" : args.approval,
    `${rows.length} artifact(s)`,
  ].join(" · ");
  return [header, ...rows.map(formatWorkProduct)].join("\n");
}

/** `library list` — filtered, provenance-tagged artifact listing. */
export async function handleLibraryList(args: LibraryListArgs, deps: LibraryDeps): Promise<number> {
  const all = await deps.readWorkProducts();
  deps.log(formatLibrary(selectWorkProducts(all, args), args));
  return 0;
}

/** Dispatch a parsed `vanta library <sub>` against injected deps. Pure orchestration. */
export async function runLibraryWith(rest: string[], deps: LibraryDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    // Default (`vanta library`) lists, matching the operator-view convention.
    case undefined:
    case "list": {
      const parsed = parseLibraryListArgs(args);
      if (!parsed.ok) {
        deps.log(`${parsed.error}\n${USAGE}`);
        return 1;
      }
      return handleLibraryList(parsed.value, deps);
    }
    default:
      deps.log(USAGE);
      return 1;
  }
}

/** Build live deps: work-products in `~/.vanta`. */
function liveLibraryDeps(): LibraryDeps {
  return {
    readWorkProducts: () => readWorkProducts(),
    log: (line) => console.log(line),
  };
}

export async function runLibraryCommand(_root: string, rest: string[]): Promise<number> {
  return runLibraryWith(rest, liveLibraryDeps());
}
