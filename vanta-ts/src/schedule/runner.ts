import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadCron as defaultLoadCron, isDue } from "./cron.js";
import type { CronEntry } from "./cron.js";
import { wakeContextForCron } from "../loop/wake.js";
import type { WakeContext } from "../loop/types.js";
import type { ImageAttachment } from "../types.js";
import {
  fireWindowKey,
  shouldFire,
  markFired,
  type LastFired,
} from "./at-most-once.js";

const FIRED_FILE = "cron-fired.json";

/**
 * Read the persisted at-most-once dedup map from `<dataDir>/cron-fired.json`,
 * or `{}` if absent/corrupt (fail-soft: a missing/garbled file must not block
 * cron — worst case is one extra fire, not a crash).
 */
export async function loadLastFired(dataDir: string): Promise<LastFired> {
  try {
    const raw = await readFile(join(dataDir, FIRED_FILE), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: LastFired = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist the dedup map to `<dataDir>/cron-fired.json` (creating the dir).
 *  Best-effort: a write failure must never break a tick (mirrors loadLastFired). */
export async function saveLastFired(
  dataDir: string,
  lastFired: LastFired,
): Promise<void> {
  const path = join(dataDir, FIRED_FILE);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(lastFired), "utf8");
  } catch {
    /* dedup persistence is best-effort; a non-writable dataDir must not break the tick */
  }
}

/**
 * Runs a single instruction and yields its final text. Injected so the runner
 * stays testable and decoupled from full agent wiring — `cli.ts` passes a real
 * implementation that calls `runAgent` and gates through the kernel.
 */
export type RunTask = (
  instruction: string,
  wake?: WakeContext,
  images?: ImageAttachment[],
) => Promise<{ finalText: string }>;

export type DueTaskResult = { id: number; instruction: string; result: string };

/** Runs a cron entry's script (HARNESS-CRON-SCRIPT-MODE). Injected like `run`. */
export type RunScript = (script: string) => Promise<{ ok: boolean; output: string }>;

type RunDueTasksOptions = {
  dataDir: string;
  now: Date;
  run: RunTask;
  /**
   * Loader for cron entries, defaulting to `loadCron`. Injected (like `run`)
   * only so tests can supply canned `CronEntry[]` without coupling to the
   * on-disk cron.tsv format; `cli.ts` omits it and gets the real loader.
   */
  load?: (dataDir: string) => Promise<CronEntry[]>;
  /**
   * At-most-once dedup map (taskId → last fired window key). When provided, a
   * due task is fired only if its `(id, windowKey)` has not fired before, the
   * key is PRE-ADVANCED (recorded before the run) so an overlapping tick that
   * starts mid-run still skips, and the updated map is returned on
   * `RunDueTasksResult.lastFired`. When omitted, every due task fires once per
   * call — the original behavior, unchanged byte-for-byte.
   */
  lastFired?: LastFired;
  /**
   * Cross-process at-most-once claim. When provided, a due task fires only if
   * the claim wins (returns true) — the store-CAS that stops two overlapping
   * PROCESSES (gateway tick + manual run) double-firing the same task, which
   * the in-process `lastFired` map alone can't. Omitted → no cross-process
   * gate (behavior unchanged). See `cron-cas.ts`.
   */
  claim?: (taskId: number, windowKey: string) => Promise<boolean>;
  /**
   * Script executor for `mode: no_agent` / `script_context` entries
   * (HARNESS-CRON-SCRIPT-MODE). When omitted, script-mode entries report a
   * clear "no script runner" error result rather than silently running as an
   * agent turn. `cli.ts`/gateway pass the real `runCronScript`.
   */
  runScript?: RunScript;
};

/**
 * Results plus the post-run dedup map. The map is only meaningful when the
 * caller passed `lastFired`; otherwise it echoes the (empty) input.
 */
export type RunDueTasksResult = {
  results: DueTaskResult[];
  lastFired: LastFired;
};

/**
 * HARNESS-CRON-SCRIPT-MODE — run a script-mode entry: no_agent delivers the
 * script's stdout with NO model call; script_context runs the script first and
 * injects its stdout into the agent turn.
 */
async function runScriptMode(
  entry: CronEntry,
  now: Date,
  run: RunTask,
  runScript?: RunScript,
): Promise<string> {
  if (!runScript) return "error: script-mode entry but no script runner configured";
  const script = entry.script ?? (entry.mode === "no_agent" ? entry.instruction : undefined);
  if (!script) return "error: script_context entry has no script";
  const res = await runScript(script);
  if (entry.mode === "no_agent") return res.ok ? res.output : `error: ${res.output}`;
  const turn = `${entry.instruction}\n\n[script output]\n${res.output}`;
  return (await run(turn, wakeContextForCron(entry, now))).finalText;
}

/** Run one due entry, capturing a throw as an "error: <message>" result. */
async function runOne(
  entry: CronEntry,
  now: Date,
  run: RunTask,
  runScript?: RunScript,
): Promise<DueTaskResult> {
  const done = (result: string): DueTaskResult => ({ id: entry.id, instruction: entry.instruction, result });
  try {
    if (entry.mode === "no_agent" || entry.mode === "script_context") {
      return done(await runScriptMode(entry, now, run, runScript));
    }
    const { finalText } = await run(entry.instruction, wakeContextForCron(entry, now));
    return done(finalText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return done(`error: ${message}`);
  }
}

/**
 * Load cron entries from `dataDir`, run every active entry that is due at `now`,
 * and collect a result per run. A single failing task is captured as an
 * "error: <message>" result and does not abort the rest of the batch.
 *
 * When `opts.lastFired` is provided, a due task fires AT MOST ONCE per
 * minute-resolution window: its window key is recorded BEFORE the run
 * (pre-advance), so an overlapping tick that re-enters during the run already
 * sees the task as fired and skips it. A genuinely-new window (the next
 * minute) is a new key and fires. Returns the post-run dedup map for the
 * caller to persist.
 */
export async function runDueTasksTracked(
  opts: RunDueTasksOptions,
): Promise<RunDueTasksResult> {
  const load = opts.load ?? defaultLoadCron;
  const entries = await load(opts.dataDir);
  const due = entries.filter(
    (entry) => entry.status === "active" && isDue(entry.cron, opts.now),
  );

  const tracking = opts.lastFired !== undefined;
  const windowKey = fireWindowKey(opts.now);
  let lastFired: LastFired = opts.lastFired ?? {};

  const results: DueTaskResult[] = [];
  for (const entry of due) {
    if (tracking && !shouldFire(entry.id, windowKey, lastFired)) continue;
    // Cross-process CAS: if another process already claimed this fire, skip.
    if (opts.claim && !(await opts.claim(entry.id, windowKey))) continue;
    // Pre-advance: record the fire before running so an overlapping tick skips.
    if (tracking) lastFired = markFired(lastFired, entry.id, windowKey);
    results.push(await runOne(entry, opts.now, opts.run, opts.runScript));
  }

  return { results, lastFired };
}

/**
 * Array-returning facade over `runDueTasksTracked` for callers that don't
 * persist a dedup map (back-compatible signature). Pass `opts.lastFired` to
 * enable at-most-once dedup; use `runDueTasksTracked` when you also need the
 * updated map back.
 */
export async function runDueTasks(
  opts: RunDueTasksOptions,
): Promise<DueTaskResult[]> {
  const { results } = await runDueTasksTracked(opts);
  return results;
}
