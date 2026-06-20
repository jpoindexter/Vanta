import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { approver } from "../session.js";
import { runFleet, type FleetDeps } from "../fleet/fleet.js";
import { parseFleetTasks, buildFleetAgentDeps, type FleetCommandDeps } from "./fleet-cmd.js";
import { createBatchPrs, formatBatchReport, buildBatchInstruction, type GhRunner, type Pusher } from "../batch/batch.js";
import type { FleetReport, FleetTaskSpec } from "../fleet/types.js";

// `vanta batch run --task <i> [--task <i> ...] [--base main]` — the PR-workflow
// fleet: spawn workers in isolated worktrees, then open one PR per completed
// worker and report the URLs. Interactive (it approves worker actions), so it
// stays CLI-only — not a TUI slash passthrough. See skills-library/batch.

const exec = promisify(execFile);
const RUN_TIMEOUT_MS = 120_000;

const defaultGh: GhRunner = async (args, cwd) => {
  try {
    const { stdout, stderr } = await exec("gh", args, { cwd, timeout: RUN_TIMEOUT_MS });
    return { ok: true, stdout, stderr };
  } catch (e) {
    return { ok: false, stdout: "", stderr: (e as Error).message };
  }
};

const defaultPush: Pusher = async (branch, cwd) => {
  try {
    await exec("git", ["push", "-u", "origin", branch], { cwd, timeout: RUN_TIMEOUT_MS });
    return { ok: true, stderr: "" };
  } catch (e) {
    return { ok: false, stderr: (e as Error).message };
  }
};

export type BatchCommandDeps = {
  log?: (line: string) => void;
  prepare?: FleetCommandDeps["prepare"];
  fleetDeps?: FleetDeps;
  /** The whole fleet run (build agent deps + spawn workers). Injected in tests. */
  runFleet?: (repoRoot: string, specs: FleetTaskSpec[]) => Promise<FleetReport>;
  gh?: GhRunner;
  push?: Pusher;
};

function parseBase(args: string[]): { base: string; rest: string[] } {
  const i = args.indexOf("--base");
  if (i < 0) return { base: "main", rest: args };
  const base = args[i + 1] ?? "main";
  return { base, rest: args.filter((_, j) => j !== i && j !== i + 1) };
}

function liveRunFleet(deps: BatchCommandDeps): (repoRoot: string, specs: FleetTaskSpec[]) => Promise<FleetReport> {
  return async (repoRoot, specs) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const baseDeps = await buildFleetAgentDeps(repoRoot, { prepare: deps.prepare, fleetDeps: deps.fleetDeps }, approver(rl));
      return await runFleet({ repoRoot, specs, deps: baseDeps, fleetDeps: deps.fleetDeps });
    } finally {
      rl.close();
    }
  };
}

const USAGE = "Usage: vanta batch run --task <instruction> [--task <instruction> ...] [--base <branch>]";

export async function runBatchCommand(repoRoot: string, rest: string[], deps: BatchCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const [cmd = "run", ...args] = rest;
  if (cmd !== "run") {
    log(USAGE);
    return cmd === "help" ? 0 : 1;
  }
  const { base, rest: taskArgs } = parseBase(args);
  const specs = parseFleetTasks(taskArgs).map((s) => ({ ...s, instruction: buildBatchInstruction(s.instruction) }));
  if (!specs.length) {
    log(USAGE);
    return 1;
  }
  const report = await (deps.runFleet ?? liveRunFleet(deps))(repoRoot, specs);
  const prs = await createBatchPrs(report, base, { gh: deps.gh ?? defaultGh, push: deps.push ?? defaultPush, cwd: repoRoot });
  log(formatBatchReport(report, prs));
  return 0;
}
