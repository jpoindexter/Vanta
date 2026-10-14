import { isKernelCommand, kernelPidFilePath, readKernelPidFile } from "./pid-file.js";
import { isProcessAlive, readProcessCommand } from "./process-ops.js";

export type KernelOwner = { supervisorPid: number; kernelPid: number; guardPid: number; pidFile: string };

export type KernelOwnerDeps = {
  isAlive: (pid: number) => boolean;
  readCommand: (pid: number) => string | null;
};

const defaultDeps: KernelOwnerDeps = { isAlive: isProcessAlive, readCommand: readProcessCommand };

/**
 * The live runtime that owns the kernel on `port` for this profile, read from its pid file. Requires the
 * supervisor to be alive AND the recorded pid to still run exactly `vanta-kernel serve <port>`, so a stale
 * file or a reused pid never reads as an owner. Returns null when nothing live owns the port.
 */
export function findLiveKernelOwner(vantaHome: string, port: number, overrides: Partial<KernelOwnerDeps> = {}): KernelOwner | null {
  const deps = { ...defaultDeps, ...overrides };
  const pidFile = kernelPidFilePath(vantaHome, port);
  const entry = readKernelPidFile(pidFile);
  if (!entry.ok || !deps.isAlive(entry.value.supervisorPid)) return null;
  const command = deps.readCommand(entry.value.kernelPid);
  if (command === null || !isKernelCommand(command, entry.value.port)) return null;
  const { supervisorPid, kernelPid, guardPid } = entry.value;
  return { supervisorPid, kernelPid, guardPid, pidFile };
}
