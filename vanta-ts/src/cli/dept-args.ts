// Pure `vanta dept add` argument parsing — flag collection + validation, no I/O.
// Errors-as-values; the name is the first bare token, `--worker`/`--goal` are
// repeatable + required, `--budget`/`--skill` optional.

const DEFAULT_DEPT_BUDGET_USD = 50;

export type DeptAddArgs = {
  name: string;
  workerIds: string[];
  goalIds: number[];
  budgetUsd: number;
  skillIds: string[];
};

/** Collect every value following each occurrence of a repeatable flag. Pure. */
function collectFlag(rest: string[], flag: string): string[] {
  const out: string[] = [];
  rest.forEach((tok, i) => {
    const val = rest[i + 1];
    if (tok === flag && val !== undefined) out.push(val);
  });
  return out;
}

/** Read the single value following a flag, or undefined. Pure. */
function oneFlag(rest: string[], flag: string): string | undefined {
  const i = rest.indexOf(flag);
  return i === -1 ? undefined : rest[i + 1];
}

const VALUE_FLAGS = ["--worker", "--goal", "--budget", "--skill"] as const;

/** Token indices consumed as a known flag's value, so they aren't read as the name. Pure. */
function flagValueIndices(rest: string[]): Set<number> {
  const taken = new Set<number>();
  rest.forEach((tok, i) => {
    if ((VALUE_FLAGS as readonly string[]).includes(tok) && i + 1 < rest.length) taken.add(i + 1);
  });
  return taken;
}

/**
 * Parse `vanta dept add` args. The name is the first bare token; `--worker` and
 * `--goal` are repeatable and required; `--budget` and `--skill` are optional.
 * Pure — no I/O. Errors-as-values.
 */
export function parseDeptAddArgs(rest: string[]): { ok: true; value: DeptAddArgs } | { ok: false; error: string } {
  const valueIdx = flagValueIndices(rest);
  const name = rest.find((a, i) => !a.startsWith("--") && !valueIdx.has(i));
  if (!name) return { ok: false, error: "name is required" };

  const workerIds = collectFlag(rest, "--worker");
  if (workerIds.length === 0) return { ok: false, error: "at least one --worker <id> is required" };

  const goalRaw = collectFlag(rest, "--goal");
  if (goalRaw.length === 0) return { ok: false, error: "at least one --goal <id> is required" };
  const goalIds: number[] = [];
  for (const g of goalRaw) {
    const n = Number(g);
    if (!Number.isInteger(n)) return { ok: false, error: `--goal must be an integer goal id, got "${g}"` };
    goalIds.push(n);
  }

  let budgetUsd = DEFAULT_DEPT_BUDGET_USD;
  const budgetRaw = oneFlag(rest, "--budget");
  if (budgetRaw !== undefined) {
    budgetUsd = Number(budgetRaw);
    if (!(Number.isFinite(budgetUsd) && budgetUsd > 0)) {
      return { ok: false, error: `--budget must be a positive number, got "${budgetRaw}"` };
    }
  }

  return { ok: true, value: { name, workerIds, goalIds, budgetUsd, skillIds: collectFlag(rest, "--skill") } };
}
