import { readMoney, offers, revenueTotal, pipelineByStage, latestProspects, type MoneyRecord } from "../money/store.js";
import { weeklyReview } from "../money/review.js";
import { latestDeliverables, latestFollowups, dueFollowups, deliverableProgress } from "../money/work.js";
import type { SlashHandler } from "./types.js";

// `/money` — view the money-making ledger (revenue · pipeline · offers · deliverables · follow-ups).
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

/** Pure: one-line weekly snapshot appended to the money view. */
export function formatWeeklySnapshot(recs: MoneyRecord[], now: number): string {
  const r = weeklyReview(recs, now);
  return `  Week: $${r.revenueThisWeek} revenue · ${r.pipelineValue} open · top: ${r.topProspect ?? "(none)"}`;
}

/** Pure: follow-ups due + deliverable progress row. */
export function formatWorkSummary(recs: MoneyRecord[], now: number): string {
  const due = dueFollowups(latestFollowups(recs), now);
  const progress = deliverableProgress(latestDeliverables(recs));
  const followupLine = due.length > 0
    ? `  Follow-ups due: ${due.length} — ${due.map((f) => `[${f.prospectId}] ${f.note}`).join("; ")}`
    : `  Follow-ups due: 0`;
  const deliverableLine = `  Deliverables: ${progress.done}/${progress.total} done`;
  return [followupLine, deliverableLine].join("\n");
}

export const money: SlashHandler = async (_arg, ctx) => {
  const recs = await readMoney(ctx.env);
  const now = ctx.now().getTime();
  return {
    output: [
      formatMoney(recs),
      formatWeeklySnapshot(recs, now),
      formatWorkSummary(recs, now),
    ].join("\n"),
  };
};
