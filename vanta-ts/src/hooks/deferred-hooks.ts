import type { ShellHook } from "./shell-hooks.js";

// VANTA-DEFERRED-SESSION-HOOKS — SessionStart hooks marked `defer: true` run
// asynchronously (fire-and-forget) so they never block the REPL becoming
// interactive. Splitting is PURE; firing the deferred set swallows every
// failure so a deferred hook can never break startup.

export type PartitionedHooks = {
  /** Hooks to run inline, blocking, exactly as today. */
  inline: ShellHook[];
  /** Hooks to fire asynchronously without blocking startup. */
  deferred: ShellHook[];
};

/** A hook is deferred only when it explicitly opts in with `defer: true`. */
function isDeferred(hook: ShellHook): boolean {
  return hook.defer === true;
}

/**
 * Split a list of matched hooks into the inline set (run blocking, as today)
 * and the deferred set (`defer === true`). Pure: input order is preserved
 * within each partition and the input array is not mutated. No hook sets
 * `defer` → `deferred` is empty and `inline` equals the input (no behavior
 * change).
 */
export function partitionDeferred(hooks: readonly ShellHook[]): PartitionedHooks {
  const inline: ShellHook[] = [];
  const deferred: ShellHook[] = [];
  for (const hook of hooks) {
    (isDeferred(hook) ? deferred : inline).push(hook);
  }
  return { inline, deferred };
}

/** Runs one hook, returning a promise that may reject. Injected for testing. */
export type DeferredRunner = (hook: ShellHook) => Promise<unknown>;

/**
 * Fire every deferred hook WITHOUT awaiting its completion (fire-and-forget),
 * so startup never blocks on them. Each runner promise has a rejection handler
 * attached so a deferred hook that throws/rejects can never surface an
 * unhandled rejection or affect startup. Returns immediately (synchronously
 * resolved) — the caller does not wait for the deferred work.
 */
export function runDeferred(deferred: readonly ShellHook[], runOne: DeferredRunner): void {
  for (const hook of deferred) {
    // Guard the synchronous portion of the runner too: a runner that throws
    // before returning a promise must not break the loop or startup.
    try {
      void Promise.resolve(runOne(hook)).catch(() => {});
    } catch {
      // swallow — a deferred hook's failure must never affect startup
    }
  }
}
