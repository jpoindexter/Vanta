import {
  adoptSkill,
  listEntriesSorted,
  publishSkill,
  readExchange,
  skillsForDepartment,
  writeExchange,
  type ExchangeEntry,
} from "../cofounder/skill-exchange.js";

// `vanta exchange publish <skill> <dept>` / `adopt <skill> <dept>` / `list [<dept>]`.
// The cross-department skill/asset exchange surface: one department publishes a
// skill slug, another adopts it, and only adopters load it (scoped binding).
// Handlers are pure over injected deps so the whole surface is unit-tested
// without real I/O. NOT wired into cli.ts/ops.ts — dispatch wiring is the
// `runExchangeCommand` exported below, ready to add as one `vanta exchange` entry.

export type ExchangeDeps = {
  readExchange: () => Promise<ExchangeEntry[]>;
  writeExchange: (entries: ExchangeEntry[]) => Promise<void>;
  log: (line: string) => void;
  now?: () => Date;
};

const USAGE = [
  "usage:",
  "  vanta exchange publish <skill> <dept>",
  "  vanta exchange adopt <skill> <dept>",
  "  vanta exchange list [<dept>]",
].join("\n");

/** Render one exchange entry as a line. Pure. */
export function formatEntry(entry: ExchangeEntry): string {
  const adopters = entry.adopters.length === 0 ? "(none)" : entry.adopters.join(", ");
  return `${entry.skillId} · published by ${entry.publishedBy} · adopters: ${adopters}`;
}

/** Render the skills a department would load (own + adopted, scoped). Pure. */
export function formatDeptSkills(deptId: string, entries: ExchangeEntry[]): string {
  const skills = skillsForDepartment(deptId, entries, []);
  const body = skills.length === 0 ? "(none)" : skills.join(", ");
  return `${deptId} loads: ${body}`;
}

/** `exchange publish <skill> <dept>` — publish a skill slug to the exchange. */
export async function handlePublish(skillId: string, byDept: string, deps: ExchangeDeps): Promise<number> {
  const entries = await deps.readExchange();
  const result = publishSkill(entries, skillId, byDept, (deps.now ?? (() => new Date()))());
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  await deps.writeExchange(result.value);
  deps.log(`published ${skillId.trim()} by ${byDept.trim()}`);
  return 0;
}

/** `exchange adopt <skill> <dept>` — adopt a published skill for a department. */
export async function handleAdopt(skillId: string, byDept: string, deps: ExchangeDeps): Promise<number> {
  const entries = await deps.readExchange();
  const result = adoptSkill(entries, skillId, byDept, (deps.now ?? (() => new Date()))());
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  await deps.writeExchange(result.value);
  deps.log(`${byDept.trim()} adopted ${skillId.trim()}`);
  return 0;
}

/** `exchange list [<dept>]` — all entries, or the scoped skills a department loads. */
export async function handleList(deptId: string | undefined, deps: ExchangeDeps): Promise<number> {
  const entries = listEntriesSorted(await deps.readExchange());
  if (deptId) {
    deps.log(formatDeptSkills(deptId, entries));
    return 0;
  }
  if (entries.length === 0) {
    deps.log("no exchange entries — publish one with: vanta exchange publish <skill> <dept>");
    return 0;
  }
  for (const e of entries) deps.log(formatEntry(e));
  return 0;
}

/** Dispatch a parsed `vanta exchange <sub>` against injected deps. Pure orchestration. */
export async function handleExchange(rest: string[], deps: ExchangeDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    case "publish": {
      const [skillId, dept] = args;
      if (skillId === undefined || dept === undefined) {
        deps.log(`publish needs a skill and a department\n${USAGE}`);
        return 1;
      }
      return handlePublish(skillId, dept, deps);
    }
    case "adopt": {
      const [skillId, dept] = args;
      if (skillId === undefined || dept === undefined) {
        deps.log(`adopt needs a skill and a department\n${USAGE}`);
        return 1;
      }
      return handleAdopt(skillId, dept, deps);
    }
    case "list":
      return handleList(args[0], deps);
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/** Build live deps: exchange entries persisted in `~/.vanta/skill-exchange.json`. */
function liveExchangeDeps(): ExchangeDeps {
  return {
    readExchange: () => readExchange(),
    writeExchange: (entries) => writeExchange(entries),
    log: (line) => console.log(line),
  };
}

export async function runExchangeCommand(rest: string[]): Promise<number> {
  return handleExchange(rest, liveExchangeDeps());
}
