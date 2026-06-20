import { addCron } from "../schedule/cron.js";
import { parseNaturalInterval } from "../schedule/natural-interval.js";
import type { CronEntry } from "../schedule/cron.js";
import type { SlashHandler, ReplCtx } from "./types.js";

/**
 * Adds a recurring cron entry. The default binds the real `addCron`; tests
 * inject a fake so the handler runs with no filesystem access.
 */
export type CronAdder = (dataDir: string, cron: string, instruction: string) => Promise<CronEntry>;

/**
 * VANTA-SKILL-LOOP — `/loop <natural-language interval> <task>`.
 *
 * Parses the leading interval phrase ("every 2 hours", "daily", "every monday",
 * "every day at 9:00") into a 5-field cron and schedules the remaining text as a
 * recurring cron entry. This is the lighter NL-cron scheduler — distinct from
 * the separate `vanta loop` scored-loop engine. An unparseable interval or a
 * missing task returns a clear error and creates no schedule.
 *
 * `addCron` is injected (defaults to the real adder) so the handler is testable
 * without touching `.vanta/cron.tsv`.
 */
export function makeLoopSchedule(add: CronAdder = addCron): SlashHandler {
  return async (arg: string, ctx: ReplCtx) => {
    const text = arg.trim();
    if (text === "") {
      return { output: "  usage: /loop <interval> <task> — e.g. /loop every 2 hours sync the repo" };
    }

    const parsed = parseNaturalInterval(text);
    if ("error" in parsed) return { output: `  ✘ ${parsed.error}` };

    if (parsed.task === "") {
      return { output: "  ✘ no task — give a task after the interval, e.g. /loop every 2 hours sync the repo" };
    }

    const entry = await add(ctx.dataDir, parsed.cron, parsed.task);
    return {
      output: `  ⟳ scheduled #${entry.id} [${entry.status}] ${entry.cron} — ${entry.instruction}`,
    };
  };
}

/** The live `/loop` handler bound to the real cron adder. */
export const loopSchedule: SlashHandler = makeLoopSchedule();
