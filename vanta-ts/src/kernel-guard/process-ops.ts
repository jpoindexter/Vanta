import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const POLL_MS = 100;

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Full command line of a pid, or null when it is gone or unreadable (never throws). */
export function readProcessCommand(pid: number): string | null {
  if (process.platform === "win32") return null;
  try {
    const out = execFileSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 2000 });
    return out.trim() || null;
  } catch {
    return null;
  }
}

export async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isProcessAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
  return true;
}

/** SIGTERM, then SIGKILL after the grace period. Resolves true when the pid is gone. */
export async function terminatePid(pid: number, graceMs: number): Promise<boolean> {
  if (!isProcessAlive(pid)) return true;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return !isProcessAlive(pid);
  }
  if (await waitForExit(pid, graceMs)) return true;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // raced with its own exit
  }
  return waitForExit(pid, graceMs);
}
