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
};

/**
 * Results plus the post-run dedup map. The map is only meaningful when the
 * caller passed `lastFired`; otherwise it echoes the (empty) input.
 */
export type RunDueTasksResult = {
  results: DueTaskResult[];
  lastFired: LastFired;
};

/** Run one due entry, capturing a throw as an "error: <message>" result. */
async function runOne(
  entry: CronEntry,
  now: Date,
  run: RunTask,
): Promise<DueTaskResult> {
  try {
    const wake = wakeContextForCron(entry, now);
    const { finalText } = await run(entry.instruction, wake);
    return { id: entry.id, instruction: entry.instruction, result: finalText };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: entry.id, instruction: entry.instruction, result: `error: ${message}` };
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
    // Pre-advance: record the fire before running so an overlapping tick skips.
    if (tracking) lastFired = markFired(lastFired, entry.id, windowKey);
    results.push(await runOne(entry, opts.now, opts.run));
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
