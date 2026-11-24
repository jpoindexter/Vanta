import { isKernelCommand, readKernelPidFile } from "./pid-file.js";
import { readProcessCommand } from "./process-ops.js";

export const DEFAULT_CLEANUP_GRACE_MS = 3500;
const TERMINATING_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export type RuntimeLifecycle = {
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
  exit?(code?: number): unknown;
};

export type ManagedChild = {
  exitCode: number | null;
  signalCode?: NodeJS.Signals | null;
  killed: boolean;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: string, listener: (...args: unknown[]) => void): unknown;
};

export type CleanupOptions = {
  graceMs?: number;
  /** Last resort when the child ignored SIGTERM: kill what it owns directly. */
  forceStop?: () => void;
  log?: (line: string) => void;
};

const hasExited = (child: ManagedChild): boolean => child.exitCode !== null || (child.signalCode ?? null) !== null;

function waitForChildExit(child: ManagedChild, graceMs: number): Promise<boolean> {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), graceMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** SIGKILL the kernel a pid file names, but only if that pid still runs `vanta-kernel serve <port>`. */
export function killKernelFromPidFile(pidFile: string): boolean {
  const entry = readKernelPidFile(pidFile);
  if (!entry.ok) return false;
  const command = readProcessCommand(entry.value.kernelPid);
  if (command === null || !isKernelCommand(command, entry.value.port)) return false;
  try {
    process.kill(entry.value.kernelPid, "SIGKILL");
    return true;
  } catch {
    return false;
  }
}

/**
 * Tie a kernel guard to the runtime that started it. The guard is told to stop (SIGTERM) on every
 * way this process can end that still lets JS run; signal paths wait for it, with a SIGKILL
 * fallback, before exiting. A SIGKILL of this process is covered by the guard's own parent watch.
 */
export function registerKernelCleanup(
  child: ManagedChild,
  runtime: RuntimeLifecycle = process,
  options: CleanupOptions = {},
): void {
  const graceMs = options.graceMs ?? DEFAULT_CLEANUP_GRACE_MS;
  const stop = () => {
    if (!hasExited(child) && !child.killed) child.kill("SIGTERM");
  };
  const terminate = (code: number) => {
    stop();
    void waitForChildExit(child, graceMs).then((exited) => {
      if (!exited) {
        options.log?.(`kernel guard did not exit within ${graceMs}ms; force-stopping`);
        options.forceStop?.();
      }
      runtime.exit?.(code);
    });
  };
  const onSignal = () => terminate(0);
  const onFatal = (...args: unknown[]) => {
    const error = args[0];
    options.log?.(`uncaught exception: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    terminate(1);
  };
  const listeners: Array<[string, (...args: unknown[]) => void]> = [
    ["exit", stop],
    ["uncaughtException", onFatal],
    ["disconnect", onSignal],
    ...TERMINATING_SIGNALS.map((signal): [string, () => void] => [signal, onSignal]),
  ];
  for (const [event, listener] of listeners) runtime.once(event, listener);
  child.once("exit", () => {
    for (const [event, listener] of listeners) runtime.removeListener(event, listener);
  });
}
