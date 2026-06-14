import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import {
  appendMoney, readMoney, offers, revenueTotal, pipelineByStage, latestProspects,
  type Offer, type Prospect, type Revenue, type Deliverable, type Followup,
} from "../money/store.js";
import { suggestPrice, weeklyReview } from "../money/review.js";
import { appendDeliverable, appendFollowup, latestFollowups, latestDeliverables, dueFollowups, deliverableProgress } from "../money/work.js";

const Args = z.object({
  action: z.enum(["offer", "prospect", "revenue", "review", "price", "weekly", "deliverable", "followup"]),
  id: z.string().optional(),
  name: z.string().optional(),
  price: z.string().optional(),
  stage: z.enum(["lead", "contacted", "replied", "booked", "won", "lost"]).optional(),
  amount: z.number().optional(),
  source: z.string().optional(),
  note: z.string().optional(),
  prospectId: z.string().optional(),
  title: z.string().optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
  due: z.string().optional(),
  done: z.string().optional(),
});
type Parsed = z.infer<typeof Args>;

function doPrice(a: Parsed): ToolResult {
  const comparables = (a.note ?? "")
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !Number.isNaN(n));
  const offer = a.name ?? "unknown";
  const suggestion = suggestPrice({ offer, comparables });
  return { ok: true, output: suggestion.note };
}

async function doWeekly(): Promise<ToolResult> {
  const recs = await readMoney();
  const now = Date.now();
  const r = weeklyReview(recs, now);
  const due = dueFollowups(latestFollowups(recs), now);
  const progress = deliverableProgress(latestDeliverables(recs));
  const lines = [
    `Revenue this week: $${r.revenueThisWeek}`,
    `Open pipeline: ${r.pipelineValue} prospect(s)`,
    `Top prospect: ${r.topProspect ?? "(none)"}`,
    `New offers this week: ${r.newOffersThisWeek}`,
    `Follow-ups due: ${due.length}${due.length > 0 ? " — " + due.map((f) => f.note).join("; ") : ""}`,
    `Deliverables: ${progress.done}/${progress.total} done`,
  ];
  return { ok: true, output: lines.join("\n") };
}

async function doOffer(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.name) return { ok: false, output: "offer needs id, name" };
  const rec: Offer = { kind: "offer", id: a.id, name: a.name, price: a.price, note: a.note, ts: new Date().toISOString() };
  await appendMoney(rec);
  return { ok: true, output: `offer recorded: ${a.name}${a.price ? ` @ ${a.price}` : ""}` };
}

async function doProspect(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.name || !a.stage) return { ok: false, output: "prospect needs id, name, stage" };
  const rec: Prospect = { kind: "prospect", id: a.id, name: a.name, stage: a.stage, note: a.note, ts: new Date().toISOString() };
  await appendMoney(rec);
  return { ok: true, output: `prospect ${a.id} → ${a.stage}: ${a.name}` };
}

async function doRevenue(a: Parsed): Promise<ToolResult> {
  if (a.amount === undefined) return { ok: false, output: "revenue needs amount" };
  const rec: Revenue = { kind: "revenue", amount: a.amount, source: a.source, note: a.note, ts: new Date().toISOString() };
  await appendMoney(rec);
  return { ok: true, output: `revenue recorded: $${a.amount}${a.source ? ` from ${a.source}` : ""}` };
}

async function doDeliverable(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.title) return { ok: false, output: "deliverable needs id, title" };
  const now = new Date().toISOString();
  const rec: Deliverable = { kind: "deliverable", id: a.id, prospectId: a.prospectId, title: a.title, status: a.status ?? "todo", due: a.due, created: now, updated: now };
  await appendDeliverable(rec);
  return { ok: true, output: `deliverable ${a.id} — "${a.title}" [${rec.status}]${a.due ? ` due ${a.due}` : ""}` };
}

async function doFollowup(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.prospectId || !a.note || !a.due) return { ok: false, output: "followup needs id, prospectId, note, due" };
  const now = new Date().toISOString();
  const rec: Followup = { kind: "followup", id: a.id, prospectId: a.prospectId, note: a.note, due: a.due, done: a.done, created: now, updated: now };
  await appendFollowup(rec);
  const status = a.done ? `done ${a.done}` : `due ${a.due}`;
  return { ok: true, output: `followup ${a.id} (${a.prospectId}): "${a.note}" [${status}]` };
}

async function doReview(): Promise<ToolResult> {
  const recs = await readMoney();
  const total = revenueTotal(recs);
  const pipeline = pipelineByStage(recs);
  const offerCount = offers(recs).length;
  const prospects = latestProspects(recs);
  const pipelineStr = Object.entries(pipeline).map(([s, n]) => `${s}:${n}`).join(" · ") || "empty";
  const wonCount = prospects.filter((p) => p.stage === "won").length;
  return {
    ok: true,
    output: [
      `Revenue: $${total}`,
      `Pipeline (${prospects.length} prospects): ${pipelineStr}`,
      `Won: ${wonCount}`,
      `Offers on file: ${offerCount}`,
    ].join("\n"),
  };
}

export const moneyTool: Tool = {
  schema: {
    name: "money",
    description:
      "Vanta's money-making ledger: track offers, prospects, revenue, deliverables, and follow-ups. " +
      "Append-only JSONL, global across sessions. " +
      "action:offer records a service or product (id, name, optional price/note); " +
      "action:prospect records a pipeline contact (id, name, stage: lead|contacted|replied|booked|won|lost); " +
      "action:revenue records an income event (amount, optional source/note); " +
      "action:review summarizes total revenue, pipeline by stage, and offer count; " +
      "action:price suggests a low/median/high price band (name=offer label, note=comma-separated comparables e.g. '1000,2000,3000'); " +
      "action:weekly returns a weekly snapshot (revenue, open pipeline, top prospect, new offers, follow-ups due, deliverable progress); " +
      "action:deliverable adds or updates a deliverable (id, title, optional prospectId/status/due; status: todo|doing|done); " +
      "action:followup adds or completes a follow-up (id, prospectId, note, due ISO date; set done=ISO date to mark complete). " +
      "Drafts and records only — never sends, never a fake identity.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["offer", "prospect", "revenue", "review", "price", "weekly", "deliverable", "followup"], description: "offer | prospect | revenue | review | price | weekly | deliverable | followup" },
        id: { type: "string", description: "stable slug id" },
        name: { type: "string", description: "human name/label (offer, prospect)" },
        price: { type: "string", description: "price string e.g. '$5k/mo' (offer)" },
        stage: { type: "string", enum: ["lead", "contacted", "replied", "booked", "won", "lost"], description: "prospect pipeline stage" },
        amount: { type: "number", description: "revenue amount in USD" },
        source: { type: "string", description: "source label (revenue)" },
        note: { type: "string", description: "detail or follow-up text" },
        prospectId: { type: "string", description: "linked prospect id (deliverable, followup)" },
        title: { type: "string", description: "deliverable title" },
        status: { type: "string", enum: ["todo", "doing", "done"], description: "deliverable status" },
        due: { type: "string", description: "ISO date string (deliverable due, followup due)" },
        done: { type: "string", description: "ISO date string — set to mark followup complete" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `money ${String(a.action ?? "")}`,
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "money needs action: offer|prospect|revenue|review|price|weekly|deliverable|followup" };
    const { action } = p.data;
    if (action === "offer") return doOffer(p.data);
    if (action === "prospect") return doProspect(p.data);
    if (action === "revenue") return doRevenue(p.data);
    if (action === "price") return doPrice(p.data);
    if (action === "weekly") return doWeekly();
    if (action === "deliverable") return doDeliverable(p.data);
    if (action === "followup") return doFollowup(p.data);
    return doReview();
  },
};
