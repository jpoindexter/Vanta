import { resolveVantaHome } from "../store/home.js";
import { watchParentExit } from "./parent-watch.js";
import { reapStaleKernels, type ReapOutcome } from "./reaper.js";

/** Set by both desktop shells: the runtime must end when the shell that spawned it ends. */
export const PARENT_WATCH_ENV = "VANTA_DESKTOP_PARENT_WATCH";
/** Kernel ownership: "1" (default for the desktop runtime) ties it to this process, "0" keeps the shared detached kernel. */
export const KERNEL_EPHEMERAL_ENV = "VANTA_KERNEL_EPHEMERAL";

let applied = false;

export type DesktopLifecycleDeps = {
  reap: (vantaHome: string) => Promise<ReapOutcome[]>;
  watch: (onOrphaned: () => void) => () => void;
  signalSelf: () => void;
  log: (line: string) => void;
};

const defaultDeps: DesktopLifecycleDeps = {
  reap: (home) => reapStaleKernels(home),
  watch: (onOrphaned) => watchParentExit(onOrphaned),
  signalSelf: () => {
    process.kill(process.pid, "SIGTERM");
  },
  log: (line) => process.stderr.write(`${line}\n`),
};

/**
 * Called once as the `vanta desktop` runtime starts, before any kernel is requested:
 * the kernel this runtime starts belongs to it, stale ones from this profile's earlier runs
 * are retired, and a shell that dies without cleanup takes the runtime down with it.
 */
export async function applyDesktopKernelLifecycle(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<DesktopLifecycleDeps> = {},
): Promise<void> {
  if (applied) return;
  applied = true;
  const deps = { ...defaultDeps, ...overrides };
  env[KERNEL_EPHEMERAL_ENV] ??= "1";
  try {
    const outcomes = await deps.reap(resolveVantaHome(env));
    for (const outcome of outcomes) {
      if (outcome.action === "reaped" || outcome.action === "refused") deps.log(`[kernel] reaper: ${JSON.stringify(outcome)}`);
    }
  } catch (error) {
    deps.log(`[kernel] reaper failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (env[PARENT_WATCH_ENV] === "1") {
    deps.watch(() => {
      deps.log("[runtime] launching shell is gone; shutting down");
      deps.signalSelf();
    });
  }
}

/** Test seam: the one-shot guard is module state. */
export function resetDesktopKernelLifecycleForTests(): void {
  applied = false;
}
