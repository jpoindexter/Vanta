import { addCron, loadCron, type CronMode } from "./cron.js";
import {
  runDueTasksTracked,
  loadLastFired,
  saveLastFired,
} from "./runner.js";
import type { RunTask } from "./runner.js";
import { fireWindowKey } from "./at-most-once.js";
import { claimFire, sweepClaims } from "./cron-cas.js";
import { runCronScript } from "./script-run.js";

/** Pull `--<flag> <value>` out of an argv slice (value + remaining args). */
function parseValueFlag(args: string[], flag: string): { value: string | null; rest: string[] } {
  const idx = args.indexOf(flag);
  if (idx === -1) return { value: null, rest: args };
  const value = args[idx + 1] ?? null;
  return { value, rest: [...args.slice(0, idx), ...args.slice(idx + 2)] };
}

/**
 * Pull the value following `--cron` out of an argv slice. Returns the cron
 * expression (or null if the flag is absent/has no value) and the remaining
 * args with the flag and its value removed.
 */
export function parseCronFlag(args: string[]): {
  cron: string | null;
  rest: string[];
} {
  const { value, rest } = parseValueFlag(args, "--cron");
  return { cron: value, rest };
}

/** HARNESS-CRON-SCRIPT-MODE — parse `--mode no_agent|script_context` + `--script "<cmd>"`. */
export function parseScheduleFlags(args: string[]): {
  cron: string | null;
  mode: CronMode | undefined;
  script: string | undefined;
  invalidMode: string | null;
  rest: string[];
} {
  const c = parseValueFlag(args, "--cron");
  const m = parseValueFlag(c.rest, "--mode");
  const s = parseValueFlag(m.rest, "--script");
  const validMode = m.value === "no_agent" || m.value === "script_context" ? m.value : undefined;
  return {
    cron: c.value,
    mode: validMode,
    script: s.value ?? undefined,
    invalidMode: m.value !== null && !validMode ? m.value : null,
    rest: s.rest,
  };
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

  const { cron, mode, script, invalidMode, rest: words } = parseScheduleFlags(rest);
  const instruction = words.join(" ").trim();
  if (!cron || instruction === "") return 1;
  if (invalidMode) {
    console.error(`--mode must be no_agent or script_context, got "${invalidMode}"`);
    return 1;
  }
  if (mode === "script_context" && !script) {
    console.error("--mode script_context needs --script \"<cmd>\" (its stdout is injected into the agent turn)");
    return 1;
  }

  const entry = await addCron(dataDir, cron, instruction, { mode, script });
  const modeTag = entry.mode ? ` (${entry.mode})` : "";
  console.log(
    `scheduled #${entry.id} [${entry.status}]${modeTag} ${entry.cron} — ${entry.instruction}`,
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
  // At-most-once: a re-invocation within the same minute (overlapping OS
  // scheduler ticks) skips a task already fired this window; the next minute
  // is a new window and fires.
  const lastFired = await loadLastFired(dataDir);
  const { results, lastFired: updated } = await runDueTasksTracked({
    dataDir,
    now,
    run,
    lastFired,
    claim: (id, windowKey) => claimFire(dataDir, id, windowKey),
    runScript: (script) => runCronScript(script),
  });
  await saveLastFired(dataDir, updated);
  await sweepClaims(dataDir, fireWindowKey(now));
  if (results.length === 0) {
    console.log("vanta cron: no tasks due");
    return;
  }
  for (const r of results) {
    console.log(`#${r.id} ${firstLine(r.result)}`);
  }
}
