// `vanta fleet tmux --task <instr> [--task <instr> ...]` — the LIVE tmux swarm
// surface. Spawns a detached tmux session with one pane per task, each pane
// launching a real one-shot `vanta run "<task>"` worker, then prints the attach
// command. Backed by fleet/tmux-backend.ts (proven against real tmux).
//
// SECURITY: the per-pane launch command is built with POSIX single-quoting
// (`shellQuote`) so an operator task string can't break out of the `vanta run
// '<task>'` argument when the pane's shell evaluates it. Each worker that then
// runs is still gated by the kernel `assess()` exactly as a normal `vanta run`.

import { parseFleetTasks } from "./fleet-cmd.js";
import {
  spawnTmuxSwarm,
  tmuxAvailable,
  type TmuxRunner,
  type TmuxWorker,
} from "../fleet/tmux-backend.js";

/** POSIX single-quote a string so it is one safe shell argument. */
export function shellQuote(s: string): string {
  return `'${s.split("'").join("'\\''")}'`;
}

/** Build the per-pane launch command: cd into the repo and run a one-shot worker. */
export function buildWorkerCommand(repoRoot: string, instruction: string): string {
  return `cd ${shellQuote(repoRoot)} && ./run.sh run ${shellQuote(instruction)}`;
}

/** Map parsed fleet tasks → tmux workers (id + the launch command). */
export function tasksToTmuxWorkers(
  repoRoot: string,
  tasks: { id: string; instruction: string }[],
): TmuxWorker[] {
  return tasks.map((t) => ({ id: t.id, command: buildWorkerCommand(repoRoot, t.instruction) }));
}

/** Injected seams for {@link runFleetTmux} (real tmux + clock by default). */
export type FleetTmuxDeps = { run?: TmuxRunner; sessionId?: string };

/**
 * `vanta fleet tmux` handler. Parses `--task` instructions, spawns one tmux pane
 * per task running a real worker, and reports the session + attach command.
 * Returns a process exit code (0 ok). Never throws — bad input / a tmux failure
 * is reported and returns non-zero.
 */
export function runFleetTmux(
  repoRoot: string,
  args: string[],
  log: (line: string) => void,
  deps: FleetTmuxDeps = {},
): number {
  let tasks: { id: string; instruction: string }[];
  try {
    tasks = parseFleetTasks(args);
  } catch (e) {
    log(`✗ ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (tasks.length === 0) {
    log("Usage: vanta fleet tmux --task <instruction> [--task <instruction> ...]");
    return 1;
  }
  const run = deps.run;
  if (!tmuxAvailable(run ?? undefined)) {
    log("✗ tmux not found — install it (e.g. `brew install tmux`) and retry.");
    return 1;
  }
  const session = `vanta-fleet-${deps.sessionId ?? String(process.pid)}`;
  const workers = tasksToTmuxWorkers(repoRoot, tasks);
  const res = spawnTmuxSwarm({ sessionName: session, workers, run });
  if (!res.ok) {
    log(`✗ tmux swarm failed: ${res.error}`);
    return 1;
  }
  log(`✓ spawned ${res.panes.length} worker pane(s) in tmux session "${session}":`);
  for (const p of res.panes) log(`  • ${p.workerId} → pane ${p.paneId} (${p.color})`);
  log(`Attach to watch: tmux attach -t ${session}`);
  log(`Kill the swarm:  tmux kill-session -t ${session}`);
  return 0;
}
