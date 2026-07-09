import { existsSync } from "node:fs";
import { spawn as spawnChild } from "node:child_process";
import { attachRuntimeService } from "../fleet/runtime.js";
import { latestFleetId, loadFleetReport, saveFleetReport } from "../fleet/store.js";
import type { FleetReport, FleetRuntimeService, FleetWorker } from "../fleet/types.js";

type RuntimeSpawn = (input: { command: string; cwd: string }) => { pid?: number };

export type RuntimeCommandDeps = {
  log?: (line: string) => void;
  spawn?: RuntimeSpawn;
  now?: () => Date;
};

type StartArgs = {
  fleetId: string;
  workerId: string;
  command: string;
  port: number;
  host?: string;
  noSpawn: boolean;
};

function usage(log: (line: string) => void): number {
  log("Usage: vanta runtime start --fleet <id> --worker <id> --port <n> --command <cmd>");
  log("       vanta runtime list [--fleet <id>]");
  return 1;
}

export async function runRuntimeCommand(repoRoot: string, rest: string[], deps: RuntimeCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  const [cmd = "list", ...args] = rest;
  if (cmd === "start") return startRuntime(repoRoot, args, deps, log);
  if (cmd === "list" || cmd === "status") return listRuntime(repoRoot, args, log);
  return usage(log);
}

function startRuntime(repoRoot: string, args: string[], deps: RuntimeCommandDeps, log: (line: string) => void): number {
  const parsed = parseStartArgs(args);
  if (!parsed) return usage(log);
  const report = loadFleetReport(repoRoot, parsed.fleetId);
  const worker = findWorker(report, parsed.workerId);
  if (!worker) {
    log(`worker not found: ${parsed.workerId}`);
    return 1;
  }
  if (!worker.worktreePath.trim() || !existsSync(worker.worktreePath)) {
    log(`worker worktree not found: ${worker.worktreePath || "(missing)"}`);
    return 1;
  }
  const spawned = parsed.noSpawn ? {} : (deps.spawn ?? spawnDetached)({ command: parsed.command, cwd: worker.worktreePath });
  const result = attachRuntimeService(report, {
    workerId: parsed.workerId,
    command: parsed.command,
    port: parsed.port,
    host: parsed.host,
    pid: spawned.pid,
    now: deps.now?.() ?? new Date(),
  });
  if (!result.ok) {
    log(result.error);
    return 1;
  }
  saveFleetReport(repoRoot, result.report);
  log(formatStarted(parsed.fleetId, worker, result.service));
  return 0;
}

function listRuntime(repoRoot: string, args: string[], log: (line: string) => void): number {
  const fleetId = flag(args, "--fleet") ?? latestFleetId(repoRoot);
  if (!fleetId) {
    log("no fleet reports found");
    return 1;
  }
  const report = loadFleetReport(repoRoot, fleetId);
  const lines = report.workers.flatMap((w) => (w.runtimeServices ?? []).map((service) => formatService(w, service)));
  log([`runtime services ${fleetId}`, ...(lines.length ? lines : ["  - no runtime services"])].join("\n"));
  return 0;
}

function parseStartArgs(args: string[]): StartArgs | null {
  const fleetId = flag(args, "--fleet");
  const workerId = flag(args, "--worker");
  const command = flag(args, "--command");
  const port = Number(flag(args, "--port"));
  if (!fleetId || !workerId || !command || !Number.isInteger(port) || port <= 0) return null;
  return { fleetId, workerId, command, port, host: flag(args, "--host"), noSpawn: args.includes("--no-spawn") };
}

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx === -1 ? undefined : args[idx + 1];
}

function findWorker(report: FleetReport, workerId: string): FleetWorker | undefined {
  return report.workers.find((w) => w.id === workerId);
}

function spawnDetached(input: { command: string; cwd: string }): { pid?: number } {
  const child = spawnChild(input.command, { cwd: input.cwd, shell: true, detached: true, stdio: "ignore" });
  child.unref();
  return { pid: child.pid };
}

function formatStarted(fleetId: string, worker: FleetWorker, service: FleetRuntimeService): string {
  const pid = service.pid ? ` · pid ${service.pid}` : "";
  return `runtime ${service.id} started · fleet ${fleetId} · worker ${worker.id} · ${service.url}${pid}`;
}

function formatService(worker: FleetWorker, service: FleetRuntimeService): string {
  const pid = service.pid ? ` · pid ${service.pid}` : "";
  return `  - ${worker.id}: ${service.status} · ${service.url}${pid} · ${service.command}`;
}
