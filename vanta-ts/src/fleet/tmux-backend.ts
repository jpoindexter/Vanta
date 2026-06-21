// VANTA-SWARM-TMUX — LIVE tmux swarm backend.
//
// This is the actuation layer the pure `tmux-layout.ts` named as its boundary:
// it runs real `tmux` child processes to create a detached session, split one
// pane per worker (balanced via `select-layout tiled`), color each pane border,
// and `send-keys` each worker's launch command into its pane. The orchestration
// is built on the pure layout/lock/color/argv helpers; only the `runTmux` seam
// touches a process — injected so it's unit-testable, defaulted to the real
// `tmux` binary so it actually works.
//
// SECURITY: every tmux invocation is `execFile("tmux", argv)` with a DISCRETE
// argv array — never a shell string — so a worker `command` (e.g. one containing
// `; rm -rf /`) is typed verbatim into its pane and never re-evaluated by a shell
// here. tmux is the WHERE (which pane a command lands in); the kernel `assess()`
// remains the WHETHER (whether the command may run) and gates the worker upstream,
// exactly as for any other backend. This module spawns tmux, not the worker's
// command directly.

import { execFileSync } from "node:child_process";
import {
  planPaneLayout,
  buildTmuxSplitArgs,
  buildTmuxSendKeysArgs,
  assignPaneColor,
} from "./tmux-layout.js";

/** One worker to place in a pane: a stable id + the shell command to launch it. */
export type TmuxWorker = { id: string; command: string };

/** Runs `tmux <argv>` and returns trimmed stdout. Throws on a non-zero exit. The
 * single impure seam — injected in tests, defaulted to the real binary. */
export type TmuxRunner = (argv: readonly string[]) => string;

/** A placed pane: which worker owns it, its tmux pane id, and its border color. */
export type PlacedPane = { workerId: string; paneId: string; color: string };

/** Result of {@link spawnTmuxSwarm}: the session + placed panes, or an error. */
export type TmuxSwarmResult =
  | { ok: true; sessionName: string; panes: PlacedPane[] }
  | { ok: false; error: string };

/** The real tmux runner — `execFile("tmux", argv)`, 10s cap, utf8 stdout. */
export const realTmuxRunner: TmuxRunner = (argv) =>
  execFileSync("tmux", argv as string[], { encoding: "utf8", timeout: 10_000 }).trim();

/** Whether a usable `tmux` is present (runs `tmux -V`). Never throws. */
export function tmuxAvailable(run: TmuxRunner = realTmuxRunner): boolean {
  try {
    run(["-V"]);
    return true;
  } catch {
    return false;
  }
}

/** Options for {@link spawnTmuxSwarm}. `run` is the injected tmux seam. */
export type SpawnTmuxSwarmOpts = {
  sessionName: string;
  workers: readonly TmuxWorker[];
  run?: TmuxRunner;
  width?: number;
  height?: number;
};

/** Create the detached session and return the id of its initial pane. */
function createSession(run: TmuxRunner, name: string, width: number, height: number): string {
  run(["new-session", "-d", "-s", name, "-x", String(width), "-y", String(height)]);
  const ids = run(["list-panes", "-t", name, "-F", "#{pane_id}"]).split("\n").filter(Boolean);
  const first = ids[0];
  if (first === undefined) throw new Error("tmux created no initial pane");
  return first;
}

/** Color a pane's border + run the worker's command in it; return the placed pane. */
function placeWorker(run: TmuxRunner, paneId: string, worker: TmuxWorker, index: number): PlacedPane {
  const color = assignPaneColor(worker.id, index);
  // Best-effort border tint — a pane that can't be styled still runs its command.
  try {
    run(["select-pane", "-t", paneId, "-P", `fg=${color}`]);
  } catch {
    /* styling is cosmetic; never fail a placement on it */
  }
  run(buildTmuxSendKeysArgs(paneId, worker.command));
  return { workerId: worker.id, paneId, color };
}

/**
 * Spawn a tmux swarm: one detached session, one pane per worker (balanced
 * tiled), each pane colored + running its worker's command. Returns the placed
 * panes. Best-effort + errors-as-values — any tmux failure returns
 * `{ ok:false, error }` and never throws through the caller. The caller owns the
 * session lifetime (see {@link killTmuxSwarm}).
 */
export function spawnTmuxSwarm(opts: SpawnTmuxSwarmOpts): TmuxSwarmResult {
  const run = opts.run ?? realTmuxRunner;
  const workers = opts.workers;
  if (workers.length === 0) return { ok: false, error: "no workers to place" };
  try {
    const firstPane = createSession(run, opts.sessionName, opts.width ?? 200, opts.height ?? 50);
    const layout = planPaneLayout(workers.length);
    const panes: PlacedPane[] = [placeWorker(run, firstPane, workers[0]!, 0)];
    for (let i = 1; i < workers.length; i++) {
      const dir = layout.panes[i]?.splitDir ?? "h";
      const paneId = run(buildTmuxSplitArgs(opts.sessionName, dir));
      panes.push(placeWorker(run, paneId, workers[i]!, i));
    }
    // Re-balance into an even grid now that all panes exist.
    try {
      run(["select-layout", "-t", opts.sessionName, "tiled"]);
    } catch {
      /* layout balancing is cosmetic */
    }
    return { ok: true, sessionName: opts.sessionName, panes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Capture a pane's visible text (`capture-pane -p`). "" on any failure. */
export function capturePaneText(paneId: string, run: TmuxRunner = realTmuxRunner): string {
  try {
    return run(["capture-pane", "-t", paneId, "-p"]);
  } catch {
    return "";
  }
}

/** Count live panes in a session (0 if the session is gone). */
export function countPanes(sessionName: string, run: TmuxRunner = realTmuxRunner): number {
  try {
    return run(["list-panes", "-t", sessionName, "-F", "#{pane_id}"]).split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

/** Kill a swarm's session. Returns whether the kill succeeded. Never throws. */
export function killTmuxSwarm(sessionName: string, run: TmuxRunner = realTmuxRunner): boolean {
  try {
    run(["kill-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}
