import { runCompanyTick, type CompanyTickDeps, type CompanyTickResult, type CompanyBeat } from "../cofounder/cadence.js";

// `vanta company tick` — advance the whole company by one operating-cadence beat:
// at most one task in each department that has open standing goals AND remaining
// budget, with a per-department beat summary. `handleCompanyTick` is PURE over the
// injected cadence deps + a `log` sink — the live deps (departments, kernel goals,
// budget scope, task dispatch) are assembled by the orchestrator that wires this
// into cli.ts/ops.ts. NOT wired here.

export type CompanyDeps = CompanyTickDeps & { log: (line: string) => void };

/** Human-readable suffix for a single beat's skip/dispatch reason. Pure. */
function reasonLabel(beat: CompanyBeat): string {
  switch (beat.reason) {
    case "dispatched":
      return `dispatched ${beat.taskId}`;
    case "no-open-goals":
      return "skipped — no open standing goals";
    case "no-budget":
      return "skipped — no remaining budget";
    case "no-task":
      return "skipped — no queued task";
    case "dispatch-failed":
      return `skipped — dispatch failed: ${beat.error ?? "unknown error"}`;
  }
}

/** Render the tick result as text lines (header + one line per department). Pure. */
export function formatCompanyTick(result: CompanyTickResult): string {
  if (result.beats.length === 0) {
    return "company tick: no departments — create one with: vanta dept add <name> --worker <id> --goal <n>";
  }
  const head = `company tick @ ${result.at} · ${result.dispatched}/${result.beats.length} department(s) advanced`;
  const lines = result.beats.map((b) => `  ${b.dispatched ? "▸" : "·"} ${b.departmentId} · ${reasonLabel(b)}`);
  return [head, ...lines].join("\n");
}

/**
 * Run one company cadence tick and print the beat summary. Pure over injected
 * deps (no I/O of its own beyond the supplied `log`). Returns a CLI exit code.
 */
export async function handleCompanyTick(deps: CompanyDeps): Promise<number> {
  const result = await runCompanyTick(deps);
  deps.log(formatCompanyTick(result));
  return 0;
}
