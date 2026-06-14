import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { appendRadar, readRadar, ranked, type Opportunity } from "../radar/store.js";
import { rankOpportunities, draftOffer } from "../radar/scan.js";

const Args = z.object({
  action: z.enum(["record", "score", "list", "scan", "offer"]),
  id: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  note: z.string().optional(),
  pain: z.number().min(0).max(1).optional(),
  buyer: z.number().min(0).max(1).optional(),
});
type Parsed = z.infer<typeof Args>;

async function doRecord(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.title) return { ok: false, output: "record needs id, title" };
  const existing = (await readRadar()).find((o) => o.id === a.id);
  const opp: Opportunity = {
    kind: "opportunity",
    id: a.id,
    title: a.title,
    source: a.source ?? existing?.source,
    pain: existing?.pain,
    buyer: existing?.buyer,
    note: a.note ?? existing?.note,
    status: existing?.status ?? "new",
    ts: new Date().toISOString(),
  };
  await appendRadar(opp);
  return { ok: true, output: `recorded opportunity:${a.id} — ${a.title}` };
}

function validateScore(a: Parsed): string | null {
  if (!a.id) return "score needs id";
  if (a.pain === undefined && a.buyer === undefined) return "score needs pain and/or buyer (0..1)";
  return null;
}

async function doScore(a: Parsed): Promise<ToolResult> {
  const err = validateScore(a);
  if (err) return { ok: false, output: err };
  const existing = (await readRadar()).find((o) => o.id === a.id);
  if (!existing) return { ok: false, output: `opportunity "${a.id}" not found — record it first` };
  const updated: Opportunity = {
    ...existing,
    pain: a.pain ?? existing.pain,
    buyer: a.buyer ?? existing.buyer,
    ts: new Date().toISOString(),
  };
  await appendRadar(updated);
  const total = (updated.pain ?? 0) + (updated.buyer ?? 0);
  return { ok: true, output: `scored ${a.id}: pain=${updated.pain ?? 0} buyer=${updated.buyer ?? 0} total=${total.toFixed(2)}` };
}

async function doList(): Promise<ToolResult> {
  const recs = await readRadar();
  const opps = ranked(recs);
  if (!opps.length) return { ok: true, output: "no opportunities recorded — use action:record" };
  const rows = opps.slice(0, 20).map((o) => {
    const total = ((o.pain ?? 0) + (o.buyer ?? 0)).toFixed(2);
    return `[${total}] ${o.id} — ${o.title} (${o.status})${o.note ? ` · ${o.note}` : ""}`;
  });
  return { ok: true, output: rows.join("\n") };
}

async function doScan(): Promise<ToolResult> {
  const recs = await readRadar();
  const ranked = rankOpportunities(recs);
  if (!ranked.length) return { ok: true, output: "no opportunities recorded — use action:record" };
  const rows = ranked.slice(0, 20).map((o, i) => {
    const s = o.compositeScore.toFixed(2);
    return `#${i + 1} [${s}] ${o.id} — ${o.title} (${o.status}) pain=${o.pain ?? 0} buyer=${o.buyer ?? 0}`;
  });
  return { ok: true, output: `Ranked scan (${ranked.length} opportunities):\n${rows.join("\n")}` };
}

async function doOffer(a: Parsed): Promise<ToolResult> {
  if (!a.id) return { ok: false, output: "offer needs id" };
  const recs = await readRadar();
  const opp = recs.findLast((o) => o.id === a.id);
  if (!opp) return { ok: false, output: `opportunity "${a.id}" not found — record it first` };
  return { ok: true, output: draftOffer(opp) };
}

export const radarTool: Tool = {
  schema: {
    name: "radar",
    description:
      "Vanta's opportunity radar: a durable ledger of scored business opportunities, persisted across sessions. " +
      "action:record adds/updates an opportunity (id, title, optional source/note); " +
      "action:score sets pain (0..1 — how expensive/urgent/repeated/reachable the problem is) and/or buyer " +
      "(0..1 — how reachable/budgeted/timing-ready the buyer is) on an existing opportunity (id required); " +
      "action:list returns all opportunities ranked by composite score (pain + buyer, 0..2); " +
      "action:scan returns a ranked scan with composite scores and position numbers; " +
      "action:offer drafts a short offer pitch for a given opportunity (id required). " +
      "Use it to track, score, surface, and act on the highest-signal opportunities.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["record", "score", "list", "scan", "offer"], description: "record | score pain+buyer | list ranked | scan ranked | offer draft" },
        id: { type: "string", description: "stable opportunity id slug" },
        title: { type: "string", description: "human label (for record)" },
        source: { type: "string", description: "where the signal came from (optional)" },
        note: { type: "string", description: "optional detail" },
        pain: { type: "number", description: "0..1 — problem severity: expensive/urgent/repeated/reachable" },
        buyer: { type: "number", description: "0..1 — buyer readiness: reachable/has-budget/good-timing" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `radar ${String(a.action ?? "")}`,
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "radar needs action: record | score | list | scan | offer" };
    if (p.data.action === "record") return doRecord(p.data);
    if (p.data.action === "score") return doScore(p.data);
    if (p.data.action === "scan") return doScan();
    if (p.data.action === "offer") return doOffer(p.data);
    return doList();
  },
};
