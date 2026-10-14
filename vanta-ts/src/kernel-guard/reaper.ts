import { unlinkSync } from "node:fs";
import {
  isGuardCommand,
  isKernelCommand,
  listKernelPidFiles,
  readKernelPidFile,
  type KernelPidFile,
} from "./pid-file.js";
import { isProcessAlive, readProcessCommand, terminatePid } from "./process-ops.js";

const REAP_GRACE_MS = 2000;

export type ReapDeps = {
  isAlive: (pid: number) => boolean;
  readCommand: (pid: number) => string | null;
  terminate: (pid: number, graceMs: number) => Promise<boolean>;
  removeFile: (path: string) => void;
};

export type ReapOutcome =
  | { path: string; action: "skipped-live-supervisor"; supervisorPid: number }
  | { path: string; action: "reaped"; kernelPid: number; guardKilled: boolean }
  | { path: string; action: "removed-stale-file"; reason: string }
  | { path: string; action: "refused"; reason: string };

const defaultDeps: ReapDeps = {
  isAlive: isProcessAlive,
  readCommand: readProcessCommand,
  terminate: terminatePid,
  removeFile: (path) => {
    try {
      unlinkSync(path);
    } catch {
      // already gone
    }
  },
};

/**
 * Decide what a pid file allows. A kernel is signalled only when its supervisor is dead AND its live
 * command line is exactly `vanta-kernel serve <port>` for the port recorded in the file: pid reuse
 * or a hand-edited file can therefore never make us kill an unrelated process.
 */
async function reapOne(path: string, entry: KernelPidFile, deps: ReapDeps): Promise<ReapOutcome> {
  if (deps.isAlive(entry.supervisorPid)) {
    return { path, action: "skipped-live-supervisor", supervisorPid: entry.supervisorPid };
  }
  const guardCommand = deps.readCommand(entry.guardPid);
  const guardKilled = guardCommand !== null && isGuardCommand(guardCommand, path)
    ? await deps.terminate(entry.guardPid, REAP_GRACE_MS)
    : false;
  const kernelCommand = deps.readCommand(entry.kernelPid);
  if (kernelCommand === null) {
    deps.removeFile(path);
    return guardKilled
      ? { path, action: "reaped", kernelPid: entry.kernelPid, guardKilled }
      : { path, action: "removed-stale-file", reason: "kernel is no longer running" };
  }
  if (!isKernelCommand(kernelCommand, entry.port)) {
    deps.removeFile(path);
    return { path, action: "refused", reason: `pid ${entry.kernelPid} is not "vanta-kernel serve ${entry.port}"` };
  }
  await deps.terminate(entry.kernelPid, REAP_GRACE_MS);
  deps.removeFile(path);
  return { path, action: "reaped", kernelPid: entry.kernelPid, guardKilled };
}

/** Remove stale kernels that belong to one profile (`<vantaHome>/run`). Other profiles are never listed. */
export async function reapStaleKernels(vantaHome: string, overrides: Partial<ReapDeps> = {}): Promise<ReapOutcome[]> {
  const deps = { ...defaultDeps, ...overrides };
  const outcomes: ReapOutcome[] = [];
  for (const path of listKernelPidFiles(vantaHome)) {
    const entry = readKernelPidFile(path);
    if (!entry.ok) {
      deps.removeFile(path);
      outcomes.push({ path, action: "removed-stale-file", reason: entry.error });
      continue;
    }
    outcomes.push(await reapOne(path, entry.value, deps));
  }
  return outcomes;
}
