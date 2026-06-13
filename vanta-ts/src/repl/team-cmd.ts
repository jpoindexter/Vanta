import { readTeam, latestWorkers, blocked, type Worker } from "../team/store.js";
import type { SlashHandler } from "./types.js";

// `/team` — view the durable worker roster. A window onto the `team` tool's store.

/** Pure: render the worker roster. */
export function formatTeam(recs: Worker[]): string {
  const workers = latestWorkers(recs);
  const head = `Team — ${workers.length} worker${workers.length === 1 ? "" : "s"}`;
  if (!workers.length) {
    return `${head}\n  (empty — define workers via the team tool)`;
  }
  const rows = workers.map((w) => `  ${w.id} · ${w.role} · ${w.status}${w.note ? ` — ${w.note}` : ""}`);
  const blockedCount = blocked(recs).length;
  const warning = blockedCount > 0 ? [`\n⚠ ${blockedCount} blocked`] : [];
  return [head, ...rows, ...warning].join("\n");
}

export const team: SlashHandler = async (_arg, ctx) => ({ output: formatTeam(await readTeam(ctx.env)) });
