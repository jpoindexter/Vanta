import { addCron, loadCron } from "./cron.js";
import { runDueTasks } from "./runner.js";
import type { RunTask } from "./runner.js";

/**
 * Pull the value following `--cron` out of an argv slice. Returns the cron
 * expression (or null if the flag is absent/has no value) and the remaining
 * args with the flag and its value removed.
 */
export function parseCronFlag(args: string[]): {
  cron: string | null;
  rest: string[];
} {
  const idx = args.indexOf("--cron");
  if (idx === -1) return { cron: null, rest: args };
  const cron = args[idx + 1] ?? null;
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { cron, rest };
}

/**
 * `vanta schedule "<instruction>" --cron "<expr>"` adds a task; `vanta schedule
 * list` prints stored tasks. Returns an exit code — non-zero on bad usage so
 * the CLI can print usage and exit accordingly.
 */
export async function runScheduleCommand(
  dataDir: string,
  rest: string[],
): Promise<number> {
  if (rest[0] === "list") {
    const entries = await loadCron(dataDir);
    if (entries.length === 0) {
      console.log("(no scheduled tasks)");
      return 0;
    }
    for (const e of entries) {
      console.log(`#${e.id} [${e.status}] ${e.cron} — ${e.instruction}`);
    }
    return 0;
  }

  const { cron, rest: words } = parseCronFlag(rest);
  const instruction = words.join(" ").trim();
  if (!cron || instruction === "") return 1;

  const entry = await addCron(dataDir, cron, instruction);
  console.log(
    `scheduled #${entry.id} [${entry.status}] ${entry.cron} — ${entry.instruction}`,
  );
  return 0;
}

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

/**
 * `vanta cron` — run every task due at `now` via the injected `run` task, then
 * print a one-line result per task. Meant to be invoked by the OS scheduler
 * (launchd/cron) every minute.
 */
export async function runCron(
  dataDir: string,
  now: Date,
  run: RunTask,
): Promise<void> {
  const results = await runDueTasks({ dataDir, now, run });
  if (results.length === 0) {
    console.log("vanta cron: no tasks due");
    return;
  }
  for (const r of results) {
    console.log(`#${r.id} ${firstLine(r.result)}`);
  }
}
