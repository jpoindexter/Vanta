import { readRadar, type Opportunity } from "../radar/store.js";
import { rankOpportunities, type RankedOpportunity } from "../radar/scan.js";
import type { SlashHandler } from "./types.js";

// `/radar` — view the opportunity radar: ranked opportunities with composite
// score + position. Uses rankOpportunities (pain+buyer composite, recency tie-break).

function formatRow(o: RankedOpportunity, pos: number): string {
  const s = o.compositeScore.toFixed(2);
  const scores = `pain=${o.pain ?? 0} buyer=${o.buyer ?? 0}`;
  return `  #${pos} [${s}] ${o.id} — ${o.title} (${o.status}) · ${scores}${o.note ? ` · ${o.note}` : ""}`;
}

/** Pure: render ranked opportunities with position numbers. */
export function formatRadar(recs: Opportunity[]): string {
  const opps = rankOpportunities(recs);
  const head = `Opportunity radar — ${opps.length} opportunit${opps.length === 1 ? "y" : "ies"}`;
  if (!opps.length) {
    return recs.length === 0
      ? `${head}\n  (empty — record opportunities via the radar tool)`
      : head;
  }
  return [head, ...opps.slice(0, 30).map((o, i) => formatRow(o, i + 1))].join("\n");
}

export const radar: SlashHandler = async (_arg, ctx) => ({ output: formatRadar(await readRadar(ctx.env)) });
