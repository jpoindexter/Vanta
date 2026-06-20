import {
  furthestFromTarget,
  getObjective,
  keyResultProgress,
  listObjectivesSorted,
  objectiveProgress,
  readObjectives,
  type Objective,
} from "../cofounder/okr.js";

// `vanta okr list` / `okr show [<id>]` — read-only progress views over the
// objective store. Handlers are pure over injected deps so the whole surface is
// unit-tested without real I/O (mirrors dept-cmd.ts). The cadence wire that
// consumes `furthestFromTarget` is a sibling slice — this surface only exposes
// the ranking in `show` so the operator can see which work is furthest behind.
// NOT wired into cli.ts/ops.ts here.

const BAR_WIDTH = 20;

export type OkrDeps = {
  readObjectives: () => Promise<Objective[]>;
  log: (line: string) => void;
};

const USAGE = ["usage:", "  vanta okr list", "  vanta okr show [<objective>]"].join("\n");

/** Render a 0..1 fraction as a `[████░░░░] 40%` progress bar. Pure. */
export function progressBar(fraction: number, width = BAR_WIDTH): string {
  const clamped = Math.min(1, Math.max(0, Number.isNaN(fraction) ? 0 : fraction));
  const filled = Math.round(clamped * width);
  const pct = Math.round(clamped * 100);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${pct}%`;
}

/** Render one objective as a progress block: title + per-KR bars. Pure. */
export function formatObjective(obj: Objective): string {
  const owner = obj.departmentId ? ` (${obj.departmentId})` : "";
  const head = `${obj.id} · ${obj.title}${owner} ${progressBar(objectiveProgress(obj))}`;
  const krs =
    obj.keyResults.length === 0
      ? "    (no key results)"
      : obj.keyResults
          .map((kr) => `    ${kr.name}: ${kr.current}/${kr.target} ${progressBar(keyResultProgress(kr))}`)
          .join("\n");
  return [head, krs].join("\n");
}

/** `okr list` — id · title · overall progress bar, one line each. */
export async function handleOkrList(deps: OkrDeps): Promise<number> {
  const list = listObjectivesSorted(await deps.readObjectives());
  if (list.length === 0) {
    deps.log("no objectives — add one with: vanta okr add (cofounder cadence)");
    return 0;
  }
  for (const obj of list) {
    const owner = obj.departmentId ? ` (${obj.departmentId})` : "";
    deps.log(`${obj.id} · ${obj.title}${owner} ${progressBar(objectiveProgress(obj))}`);
  }
  return 0;
}

/** `okr show [<id>]` — full per-KR progress blocks, plus the furthest-behind KR. */
export async function handleOkrShow(objectiveId: string | undefined, deps: OkrDeps): Promise<number> {
  const all = listObjectivesSorted(await deps.readObjectives());
  if (objectiveId) {
    const obj = getObjective(all, objectiveId);
    if (!obj) {
      deps.log(`unknown objective "${objectiveId}"`);
      return 1;
    }
    deps.log(formatObjective(obj));
    return 0;
  }
  if (all.length === 0) {
    deps.log("no objectives — add one with: vanta okr add (cofounder cadence)");
    return 0;
  }
  for (const obj of all) deps.log(formatObjective(obj));
  const furthest = furthestFromTarget(all);
  if (furthest) {
    const owner = furthest.objective.departmentId ? ` (${furthest.objective.departmentId})` : "";
    deps.log(
      `\nfurthest from target: ${furthest.objective.title}${owner} · ` +
        `${furthest.keyResult.name} (gap ${Math.round(furthest.gap * 100)}%)`,
    );
  }
  return 0;
}

/** Dispatch a parsed `vanta okr <sub>` against injected deps. Pure orchestration. */
export async function handleOkr(rest: string[], deps: OkrDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    case "list":
      return handleOkrList(deps);
    case "show":
      return handleOkrShow(args[0], deps);
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/** Build live deps: objectives from `~/.vanta/okrs.json`. */
function liveOkrDeps(): OkrDeps {
  return {
    readObjectives: () => readObjectives(),
    log: (line) => console.log(line),
  };
}

export async function runOkrCommand(rest: string[]): Promise<number> {
  return handleOkr(rest, liveOkrDeps());
}
