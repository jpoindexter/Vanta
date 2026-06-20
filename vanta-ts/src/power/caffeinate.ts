// VANTA-PREVENT-SLEEP — keep macOS awake for the duration of a long operation
// (loop/cron/gateway run) by spawning `caffeinate`, then killing it when the
// operation ends. Off by default; opt-in via VANTA_CAFFEINATE; no-op anywhere
// but macOS. Pure lifecycle: spawn/platform/enabled are injected so the
// start→kill behavior is fully unit-testable without a real process.

import { spawn } from "node:child_process";

/** The minimal child-process surface caffeinate needs: a killable handle. */
export type CaffeinateChild = { kill: (signal?: NodeJS.Signals | number) => boolean };

/** Spawn fn shape — injected so tests can assert start/kill without a real proc. */
export type SpawnCaffeinate = (command: string, args: string[]) => CaffeinateChild;

export type CaffeinateDeps = {
  /** Spawns the `caffeinate` process. Defaults to a detached node spawn. */
  spawn?: SpawnCaffeinate;
  /** Host platform; defaults to `process.platform`. Only "darwin" caffeinates. */
  platform?: NodeJS.Platform;
  /** Whether caffeination is enabled (read from env by `resolveCaffeinate`). */
  enabled?: boolean;
};

// `-i` prevents idle system sleep — enough to keep a long run alive without
// forcing the display on (that would be `-d`). `-s` is asserted-power-only and
// weaker on battery, so `-i` is the safe default for an unattended operation.
const CAFFEINATE_CMD = "caffeinate";
const CAFFEINATE_ARGS = ["-i"];

/** Default spawn: a detached, output-ignoring caffeinate child, unref'd so it
 * never holds the Node process open if we somehow fail to kill it. */
function defaultSpawn(command: string, args: string[]): CaffeinateChild {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
  return child;
}

/**
 * Read `VANTA_CAFFEINATE` from `env` (default OFF). Truthy values: "1", "true",
 * "yes", "on" (case-insensitive). Anything else — including unset — is OFF.
 */
export function resolveCaffeinate(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.VANTA_CAFFEINATE ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** True only when enabled AND on macOS — the single gate for spawning. */
function shouldCaffeinate(deps: CaffeinateDeps): boolean {
  const platform = deps.platform ?? process.platform;
  return deps.enabled === true && platform === "darwin";
}

/** Start caffeinate if we should; a spawn failure degrades to no child (the
 * operation must never break because we couldn't keep the system awake). */
function startCaffeinate(deps: CaffeinateDeps): CaffeinateChild | null {
  if (!shouldCaffeinate(deps)) return null;
  const spawnFn = deps.spawn ?? defaultSpawn;
  try {
    return spawnFn(CAFFEINATE_CMD, CAFFEINATE_ARGS);
  } catch {
    return null;
  }
}

/** Kill caffeinate, swallowing any error (the child may already be gone). */
function stopCaffeinate(child: CaffeinateChild | null): void {
  if (!child) return;
  try {
    child.kill();
  } catch {
    // already exited / not killable — nothing to do
  }
}

/**
 * Run `fn` while keeping macOS awake. On macOS + enabled, spawns `caffeinate`
 * for the lifetime of `fn` and kills it in a `finally` (even if `fn` throws).
 * Off/non-macOS → just runs `fn`, no spawn. Returns `fn`'s value.
 */
export async function withCaffeinate<T>(
  fn: () => Promise<T>,
  deps: CaffeinateDeps = {},
): Promise<T> {
  const child = startCaffeinate(deps);
  try {
    return await fn();
  } finally {
    stopCaffeinate(child);
  }
}
