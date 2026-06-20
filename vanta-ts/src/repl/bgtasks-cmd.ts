import { listBgTasks, readBgTask, type BgTask, type BgTaskStatus } from "../tools/bg-tasks.js";
import type { SlashHandler } from "./types.js";

// /bgtasks — list (and stop) the session's background shell tasks.
// Distinct from the operator task stack (/tasks) and the workflow run list
// (/wftasks): this is the bg-tasks.ts store of detached `shell_cmd` jobs.

const STATUS_GLYPH: Record<BgTaskStatus, string> = {
  running: "▶",
  done: "✓",
  failed: "✗",
};

/** One rendered row: glyph + status + id + truncated command label. */
function taskLine(t: BgTask): string {
  return `  ${STATUS_GLYPH[t.status]} [${t.status}] ${t.id}  ${t.command.slice(0, 60)}`;
}

/** PURE — render the background-task list (id · status · label). Empty → placeholder. */
export function formatTasks(tasks: readonly BgTask[]): string {
  if (!tasks.length) return "  (no background tasks)";
  return tasks.map(taskLine).join("\n");
}

/** Injected side effects so the handler logic stays pure + unit-testable. */
export type TasksDeps = {
  listTasks: () => Promise<BgTask[]>;
  /** Stop a running task by id; errors-as-values, never throws. */
  stopTask: (id: string) => Promise<{ ok: boolean; error?: string; task?: BgTask }>;
};

/**
 * PURE handler core: no arg (or `list`) → render the list; `stop <id>` → stop the
 * matching task. Returns a `{ output }` payload; all I/O is injected via `deps`.
 */
export async function handleTasks(arg: string, deps: TasksDeps): Promise<{ output: string }> {
  const [sub, ...rest] = arg.trim().split(/\s+/).filter(Boolean);

  if (!sub || sub === "list") {
    return { output: formatTasks(await deps.listTasks()) };
  }

  if (sub === "stop") {
    const id = rest[0];
    if (!id) return { output: "  Usage: /bgtasks stop <id>" };
    const result = await deps.stopTask(id);
    if (!result.ok) return { output: `  ✗ ${result.error ?? `no background task matching '${id}'`}` };
    return { output: `  ✓ stopped ${result.task?.id ?? id}` };
  }

  return { output: `  Unknown subcommand '${sub}'. Use: list · stop <id>` };
}

/** Default stopTask: signal the live task's pid (errors-as-values). */
async function stopBgTask(dataDir: string, id: string): ReturnType<TasksDeps["stopTask"]> {
  const task = await readBgTask(dataDir, id);
  if (!task) return { ok: false, error: `no background task matching '${id}'` };
  if (task.status !== "running") return { ok: false, error: `task ${task.id} is already ${task.status}` };
  if (task.pid === undefined) return { ok: false, error: `task ${task.id} has no pid to stop` };
  try {
    process.kill(task.pid, "SIGTERM");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `could not stop ${task.id}: ${msg}` };
  }
  return { ok: true, task };
}

/** Slash handler — wires the pure core to the live bg-tasks store (ctx.dataDir = .vanta). */
export const bgtasks: SlashHandler = async (arg, ctx) => {
  const dataDir = ctx.dataDir;
  return handleTasks(arg, {
    listTasks: () => listBgTasks(dataDir),
    stopTask: (id) => stopBgTask(dataDir, id),
  });
};
