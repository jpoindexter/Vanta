import { readMoney, offers, revenueTotal, pipelineByStage, latestProspects, type MoneyRecord } from "../money/store.js";
import type { SlashHandler } from "./types.js";

// `/money` — view the money-making ledger (revenue · pipeline · offers).
// A window onto the `money` tool's store.

/** Pure: render the money ledger summary. */
export function formatMoney(recs: MoneyRecord[]): string {
  const total = revenueTotal(recs);
  const prospects = latestProspects(recs);
  const pipeline = pipelineByStage(recs);
  const offerList = offers(recs);

  const pipelineStr = Object.entries(pipeline)
    .map(([stage, count]) => `${stage}: ${count}`)
    .join(" · ") || "empty";

  const head = `Money OS — $${total} revenue · ${prospects.length} prospect(s) · ${offerList.length} offer(s)`;

  if (recs.length === 0) {
    return `${head}\n  (empty — record offers, prospects, and revenue via the money tool)`;
  }

  const pipelineRow = `  Pipeline: ${pipelineStr}`;
  const offerRows = offerList.slice(0, 20).map((o) => `  offer:${o.id} — ${o.name}${o.price ? ` · ${o.price}` : ""}${o.note ? ` · ${o.note}` : ""}`);

  return [head, pipelineRow, ...offerRows].join("\n");
}

export const money: SlashHandler = async (_arg, ctx) => ({ output: formatMoney(await readMoney(ctx.env)) });
