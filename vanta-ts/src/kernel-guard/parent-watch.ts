const DEFAULT_POLL_MS = 1000;

export type ParentWatchDeps = {
  getParentPid: () => number;
  isAlive: (pid: number) => boolean;
};

/**
 * Detect that the process which launched this one is gone. A SIGKILL'd parent runs no handlers, so
 * the child polls: its parent pid changes (reparented to init/a subreaper) or the pid disappears.
 * Returns a stop function; with no parent to watch (started by init) it does nothing.
 */
export function watchParentExit(
  onOrphaned: () => void,
  options: { intervalMs?: number; deps?: ParentWatchDeps } = {},
): () => void {
  const deps: ParentWatchDeps = options.deps ?? {
    getParentPid: () => process.ppid,
    isAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "EPERM";
      }
    },
  };
  const parent = deps.getParentPid();
  if (parent <= 1) return () => undefined;
  const timer = setInterval(() => {
    if (deps.getParentPid() !== parent || !deps.isAlive(parent)) {
      clearInterval(timer);
      onOrphaned();
    }
  }, options.intervalMs ?? DEFAULT_POLL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
