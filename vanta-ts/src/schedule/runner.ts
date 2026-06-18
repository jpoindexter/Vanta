import { loadCron as defaultLoadCron, isDue } from "./cron.js";
import type { CronEntry } from "./cron.js";
import { wakeContextForCron } from "../loop/wake.js";
import type { WakeContext } from "../loop/types.js";

/**
 * Runs a single instruction and yields its final text. Injected so the runner
 * stays testable and decoupled from full agent wiring — `cli.ts` passes a real
 * implementation that calls `runAgent` and gates through the kernel.
 */
export type RunTask = (instruction: string, wake?: WakeContext) => Promise<{ finalText: string }>;

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
};

/**
 * Load cron entries from `dataDir`, run every active entry that is due at `now`,
 * and collect a result per run. A single failing task is captured as an
 * "error: <message>" result and does not abort the rest of the batch.
 */
export async function runDueTasks(
  opts: RunDueTasksOptions,
): Promise<DueTaskResult[]> {
  const load = opts.load ?? defaultLoadCron;
  const entries = await load(opts.dataDir);
  const due = entries.filter(
    (entry) => entry.status === "active" && isDue(entry.cron, opts.now),
  );

  const results: DueTaskResult[] = [];
  for (const entry of due) {
    try {
      const wake = wakeContextForCron(entry, opts.now);
      const { finalText } = await opts.run(entry.instruction, wake);
      results.push({ id: entry.id, instruction: entry.instruction, result: finalText });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        id: entry.id,
        instruction: entry.instruction,
        result: `error: ${message}`,
      });
    }
  }

  return results;
}
