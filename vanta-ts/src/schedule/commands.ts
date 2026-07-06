import { addCron, loadCron, type CronMode, type RoutinePolicy } from "./cron.js";
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

/** HARNESS-CRON-SCRIPT-MODE + PCLIP-ROUTINES-ISSUE — parse `--mode`, `--script`,
 * and `--routine [skip|once]` (bare `--routine` defaults to skip). */
export function parseScheduleFlags(args: string[]): {
  cron: string | null;
  mode: CronMode | undefined;
  script: string | undefined;
  routine: RoutinePolicy | undefined;
  invalidMode: string | null;
  rest: string[];
} {
  const c = parseValueFlag(args, "--cron");
  const m = parseValueFlag(c.rest, "--mode");
  const s = parseValueFlag(m.rest, "--script");
  // --routine takes an OPTIONAL policy value; a bare flag (next word is another
  // flag / absent) means "routine with the default skip policy".
  let routine: RoutinePolicy | undefined;
  let rest = s.rest;
  const rIdx = rest.indexOf("--routine");
  if (rIdx !== -1) {
    const v = rest[rIdx + 1];
    const explicit = v === "skip" || v === "once";
    routine = explicit ? v : "skip";
    rest = [...rest.slice(0, rIdx), ...rest.slice(rIdx + (explicit ? 2 : 1))];
  }
  const validMode = m.value === "no_agent" || m.value === "script_context" ? m.value : undefined;
  return {
    cron: c.value,
    mode: validMode,
    script: s.value ?? undefined,
    routine,
    invalidMode: m.value !== null && !validMode ? m.value : null,
    rest,
  };
}

/**
 * `vanta schedule "<instruction>" --cron "<expr>"` adds a task; `vanta schedule
 * list` prints stored tasks. Returns an exit code — non-zero on bad usage so
 * the CLI can print usage and exit accordingly.
 */
async function runScheduleList(dataDir: string): Promise<number> {
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

/** Flag validation for `vanta schedule` adds; a returned string is the error. */
function scheduleFlagError(f: ReturnType<typeof parseScheduleFlags>): string | null {
  if (f.invalidMode) return `--mode must be no_agent or script_context, got "${f.invalidMode}"`;
  if (f.mode === "script_context" && !f.script) {
    return '--mode script_context needs --script "<cmd>" (its stdout is injected into the agent turn)';
  }
  return null;
}

export async function runScheduleCommand(
  dataDir: string,
  rest: string[],
): Promise<number> {
  if (rest[0] === "list") return runScheduleList(dataDir);

  const flags = parseScheduleFlags(rest);
  const instruction = flags.rest.join(" ").trim();
  if (!flags.cron || instruction === "") return 1;
  const err = scheduleFlagError(flags);
  if (err) {
    console.error(err);
    return 1;
  }

  const entry = await addCron(dataDir, flags.cron, instruction, { mode: flags.mode, script: flags.script, routine: flags.routine });
  const modeTag = [entry.mode ? ` (${entry.mode})` : "", entry.routine ? ` (routine:${entry.routine})` : ""].join("");
  console.log(
    `scheduled #${entry.id} [${entry.status}]${modeTag} ${entry.cron} — ${entry.instruction}`,
  );
  return 0;
}

/** PCLIP-ROUTINES-ISSUE — live issue creator: a routine fire lands as an unread ticket. */
export async function createRoutineIssue(dataDir: string, title: string): Promise<string> {
  const { createTicket } = await import("../tickets/store.js");
  const { randomUUID } = await import("node:crypto");
  const t = await createTicket(dataDir, { title, labels: ["routine"] }, { now: () => new Date(), id: () => `tkt-${randomUUID().slice(0, 8)}` });
  return t.id;
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
    createIssue: (title) => createRoutineIssue(dataDir, title),
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
