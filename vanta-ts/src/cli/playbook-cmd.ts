import { readPlaybooks, type Playbook } from "../cofounder/org-learning.js";

// `vanta playbook list` / `show <id>` — read-only views over the org playbooks
// extracted from completed department work (cofounder/org-learning.ts). Handlers
// are pure over injected deps so the whole surface is unit-tested without I/O.
// NOT yet wired into cli.ts/ops.ts — see dispatch_wiring in the slice report.

export type PlaybookDeps = {
  readPlaybooks: () => Promise<Playbook[]>;
  log: (line: string) => void;
};

const USAGE = ["usage:", "  vanta playbook list", "  vanta playbook show <id>"].join("\n");

/** All playbooks, sorted by department then taskType for a stable view. Pure. */
function sortPlaybooks(list: Playbook[]): Playbook[] {
  return [...list].sort(
    (a, b) => a.departmentId.localeCompare(b.departmentId) || a.taskType.localeCompare(b.taskType),
  );
}

/** One-line summary of a playbook for the list view. Pure. */
export function formatPlaybookLine(pb: Playbook): string {
  return `${pb.id} · ${pb.departmentId} · ${pb.taskType} · ${pb.steps.length} step(s) · from ${pb.fromTaskIds.length} task(s)`;
}

/** Full detail block for one playbook (steps + provenance). Pure. */
export function formatPlaybook(pb: Playbook): string {
  const steps = pb.steps.length === 0 ? "    (no steps)" : pb.steps.map((s, i) => `    ${i + 1}. ${s}`).join("\n");
  return [
    `${pb.id}`,
    `  department: ${pb.departmentId}`,
    `  task type:  ${pb.taskType}`,
    "  steps:",
    steps,
    `  from tasks: ${pb.fromTaskIds.join(", ")}`,
  ].join("\n");
}

/** `playbook list` — one line per playbook. */
export async function handlePlaybookList(deps: PlaybookDeps): Promise<number> {
  const list = sortPlaybooks(await deps.readPlaybooks());
  if (list.length === 0) {
    deps.log("no playbooks yet — they form after 3 completed tasks of one type in a department");
    return 0;
  }
  for (const pb of list) deps.log(formatPlaybookLine(pb));
  return 0;
}

/** `playbook show <id>` — full detail for one playbook. */
export async function handlePlaybookShow(id: string, deps: PlaybookDeps): Promise<number> {
  const pb = (await deps.readPlaybooks()).find((p) => p.id === id);
  if (!pb) {
    deps.log(`unknown playbook "${id}"`);
    return 1;
  }
  deps.log(formatPlaybook(pb));
  return 0;
}

/** Dispatch a parsed `vanta playbook <sub>` against injected deps. Pure orchestration. */
export async function handlePlaybook(rest: string[], deps: PlaybookDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    case "list":
      return handlePlaybookList(deps);
    case "show": {
      const id = args[0];
      if (id === undefined) {
        deps.log(`show needs a playbook id\n${USAGE}`);
        return 1;
      }
      return handlePlaybookShow(id, deps);
    }
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/** Build live deps: playbooks from the global `~/.vanta` store. */
function livePlaybookDeps(): PlaybookDeps {
  return {
    readPlaybooks: () => readPlaybooks(),
    log: (line) => console.log(line),
  };
}

/** Live entry point for `vanta playbook <sub>` — wire this into cli.ts/ops.ts to enable the command. */
export async function runPlaybookCommand(rest: string[]): Promise<number> {
  return handlePlaybook(rest, livePlaybookDeps());
}
