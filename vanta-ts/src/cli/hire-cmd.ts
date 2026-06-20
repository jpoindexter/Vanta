import { appendTeam, readTeam, latestWorkers } from "../team/store.js";
import { hireAgent, type HireSpec } from "../team/hire.js";

// `vanta hire <role> --adapter <x> [--budget <usd>] [--title <t>]`
// Adds a budgeted, role-tagged agent to the durable team roster so it can then
// be assigned tasks via the team dispatch path. Pure parser + thin persistence.

export type HireArgs =
  | { ok: true; spec: HireSpec }
  | { ok: false; error: string };

const FLAGS = ["--adapter", "--budget", "--title"] as const;

/** Read the value following a flag, e.g. parseFlag(["--adapter","openai"],"--adapter") → "openai". */
function parseFlag(rest: string[], flag: string): string | undefined {
  const i = rest.indexOf(flag);
  if (i === -1) return undefined;
  return rest[i + 1];
}

/** Indices consumed as a known flag's value, so they aren't mistaken for the role. */
function flagValueIndices(rest: string[]): Set<number> {
  const taken = new Set<number>();
  rest.forEach((tok, i) => {
    if ((FLAGS as readonly string[]).includes(tok) && i + 1 < rest.length) taken.add(i + 1);
  });
  return taken;
}

/**
 * Parse `vanta hire` args. The role is the first bare token that is neither a
 * flag nor a flag's value; `--adapter` is required; `--budget` and `--title`
 * are optional. Pure — no I/O.
 */
export function parseHireArgs(rest: string[]): HireArgs {
  const valueIdx = flagValueIndices(rest);
  const role = rest.find((a, i) => !a.startsWith("--") && !valueIdx.has(i));
  if (!role) return { ok: false, error: "role is required" };

  const adapter = parseFlag(rest, "--adapter");
  if (!adapter) return { ok: false, error: "--adapter <provider-id> is required" };

  const budgetRaw = parseFlag(rest, "--budget");
  let budgetUsd: number | undefined;
  if (budgetRaw !== undefined) {
    budgetUsd = Number(budgetRaw);
    if (!(Number.isFinite(budgetUsd) && budgetUsd > 0)) {
      return { ok: false, error: `--budget must be a positive number, got "${budgetRaw}"` };
    }
  }

  const title = parseFlag(rest, "--title");
  return { ok: true, spec: { role, adapter, ...(budgetUsd !== undefined ? { budgetUsd } : {}), ...(title ? { title } : {}) } };
}

const USAGE = 'usage: vanta hire <role> --adapter <provider-id> [--budget <usd>] [--title <tag>]';

export async function runHireCommand(_root: string, rest: string[]): Promise<number> {
  const parsed = parseHireArgs(rest);
  if (!parsed.ok) {
    console.error(`${parsed.error}\n${USAGE}`);
    return 1;
  }

  const roster = latestWorkers(await readTeam());
  const result = hireAgent(roster, parsed.spec);
  if (!result.ok) {
    console.error(result.error);
    return 1;
  }

  await appendTeam(result.agent);
  const a = result.agent;
  const budget = a.budgetUsd !== undefined ? ` · budget $${a.budgetUsd}` : "";
  console.log(`hired ${a.id} · ${a.title} · role: ${a.role} · adapter: ${a.adapter} (${a.model})${budget}`);
  console.log(`assign work with: team dispatch (workerId: ${a.id})`);
  return 0;
}
