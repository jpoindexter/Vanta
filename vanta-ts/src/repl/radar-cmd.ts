import { readRadar, ranked, score, type Opportunity } from "../radar/store.js";
import type { SlashHandler } from "./types.js";

// `/radar` — view the opportunity radar: ranked opportunities with composite
// score + status. A window onto the `radar` tool's store.

function formatRow(o: Opportunity): string {
  const total = score(o).toFixed(2);
  const scores = `pain=${o.pain ?? 0} buyer=${o.buyer ?? 0}`;
  return `  [${total}] ${o.id} — ${o.title} (${o.status}) · ${scores}${o.note ? ` · ${o.note}` : ""}`;
}

/** Pure: render ranked opportunities. */
export function formatRadar(recs: Opportunity[]): string {
  const opps = ranked(recs);
  const head = `Opportunity radar — ${opps.length} opportunit${opps.length === 1 ? "y" : "ies"}`;
  if (!opps.length) {
    return recs.length === 0
      ? `${head}\n  (empty — record opportunities via the radar tool)`
      : head;
  }
  return [head, ...opps.slice(0, 30).map(formatRow)].join("\n");
}

export const radar: SlashHandler = async (_arg, ctx) => ({ output: formatRadar(await readRadar(ctx.env)) });
