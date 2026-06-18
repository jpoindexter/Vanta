import { createInterface } from "node:readline/promises";
import { prepareRun, approver, buildSummarizer } from "../session.js";
import { runFleet, acceptFleetWorker, type FleetDeps } from "../fleet/fleet.js";
import { formatFleetReview, formatFleetStatus } from "../fleet/format.js";
import { latestFleetId, loadFleetReport } from "../fleet/store.js";
import { FleetTaskSpecSchema, type FleetTaskSpec } from "../fleet/types.js";
import type { AgentDeps } from "../agent.js";

export type FleetCommandDeps = {
  log?: (line: string) => void;
  prepare?: (repoRoot: string, instruction: string) => Promise<Awaited<ReturnType<typeof prepareRun>>>;
  fleetDeps?: FleetDeps;
};

function usage(log: (line: string) => void): number {
  log("Usage: vanta fleet run --task <instruction> [--task <instruction> ...]");
  log("       vanta fleet status [fleet-id]");
  log("       vanta fleet review [fleet-id]");
  log("       vanta fleet accept <fleet-id> <worker-id>");
  return 1;
}

function slug(s: string, i: number): string {
  return `${i + 1}-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "task"}`;
}

export function parseFleetTasks(args: string[]): FleetTaskSpec[] {
  const tasks: FleetTaskSpec[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--task") continue;
    const instruction = args[i + 1];
    if (!instruction) throw new Error("--task requires an instruction");
    tasks.push(FleetTaskSpecSchema.parse({ id: slug(instruction, tasks.length), title: instruction, instruction }));
    i++;
  }
  return tasks;
}

async function agentDeps(
  repoRoot: string,
  deps: FleetCommandDeps,
  requestApproval: AgentDeps["requestApproval"],
): Promise<AgentDeps> {
  const setup = await (deps.prepare ?? prepareRun)(repoRoot, "parallel agent fleet");
  return {
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root: repoRoot,
    requestApproval,
    summarize: buildSummarizer(setup.provider),
    getEffortLevel: () => setup.effortLevel,
    advisorProvider: setup.advisorProvider,
  };
}

function resolveFleetId(repoRoot: string, id: string | undefined): string {
  const resolved = id ?? latestFleetId(repoRoot);
  if (!resolved) throw new Error("no fleet reports found");
  return resolved;
}

async function run(repoRoot: string, rest: string[], deps: FleetCommandDeps, log: (line: string) => void): Promise<number> {
  const specs = parseFleetTasks(rest);
  if (!specs.length) return usage(log);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const baseDeps = await agentDeps(repoRoot, deps, approver(rl));
    const report = await runFleet({ repoRoot, specs, deps: baseDeps, fleetDeps: deps.fleetDeps });
    log(formatFleetStatus(report));
    return 0;
  } finally {
    rl.close();
  }
}

function status(repoRoot: string, id: string | undefined, log: (line: string) => void): number {
  log(formatFleetStatus(loadFleetReport(repoRoot, resolveFleetId(repoRoot, id))));
  return 0;
}

function review(repoRoot: string, id: string | undefined, log: (line: string) => void): number {
  log(formatFleetReview(loadFleetReport(repoRoot, resolveFleetId(repoRoot, id))));
  return 0;
}

async function accept(repoRoot: string, rest: string[], deps: FleetCommandDeps, log: (line: string) => void): Promise<number> {
  const [id, workerId] = rest;
  if (!id || !workerId) return usage(log);
  const report = await acceptFleetWorker({ repoRoot, fleetId: id, workerId, deps: deps.fleetDeps });
  log(formatFleetStatus(report));
  return 0;
}

export async function runFleetCommand(repoRoot: string, rest: string[], deps: FleetCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const [cmd = "status", ...args] = rest;
  if (cmd === "run") return run(repoRoot, args, deps, log);
  if (cmd === "status") return status(repoRoot, args[0], log);
  if (cmd === "review") return review(repoRoot, args[0], log);
  if (cmd === "accept") return accept(repoRoot, args, deps, log);
  return usage(log);
}
