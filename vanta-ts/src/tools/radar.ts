import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { appendRadar, readRadar, ranked, type Opportunity } from "../radar/store.js";
import { rankOpportunities, draftOffer } from "../radar/scan.js";
import { toProspect } from "../radar/promote.js";
import { appendMoney } from "../money/store.js";
import { extractOpportunities, fromReddit, fromFeed, fromTwitter } from "../radar/extract.js";
import { resolveSearchProvider } from "../search/index.js";
import { loadCookie } from "../reach/cookie.js";
import { searchReddit } from "../reach/reddit.js";
import { fetchFeed } from "../reach/rss.js";
import { searchTwitter } from "../reach/twitter.js";

const Args = z.object({
  action: z.enum(["record", "score", "list", "scan", "offer", "promote", "scan_web"]),
  id: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  note: z.string().optional(),
  pain: z.number().min(0).max(1).optional(),
  buyer: z.number().min(0).max(1).optional(),
  query: z.string().optional(),
  // scan_web source routing
  from: z.enum(["web", "reddit", "rss", "twitter"]).optional(),
  subreddit: z.string().optional(),
  feed: z.string().optional(),
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

async function doPromote(a: Parsed): Promise<ToolResult> {
  if (!a.id) return { ok: false, output: "promote needs id" };
  const recs = await readRadar();
  const opp = recs.findLast((o) => o.id === a.id);
  if (!opp) return { ok: false, output: `opportunity "${a.id}" not found — record it first` };
  const prospect = toProspect(opp);
  await appendMoney({ kind: "prospect", ...prospect });
  return { ok: true, output: `promoted "${opp.title}" → prospect "${prospect.name}" (id:${prospect.id}) at stage:lead` };
}

/** Append candidates to the radar + summarize. Shared by every scan source. */
async function appendCandidates(candidates: Opportunity[], label: string): Promise<ToolResult> {
  if (!candidates.length) return { ok: true, output: `scan_web (${label}): no candidates found — nothing added` };
  for (const opp of candidates) await appendRadar(opp);
  const summary = candidates
    .slice(0, 5)
    .map((o) => `  • ${o.id} — ${o.title} (pain=${o.pain?.toFixed(1)} buyer=${o.buyer?.toFixed(1)})`)
    .join("\n");
  return { ok: true, output: `scan_web (${label}): added ${candidates.length} candidate(s)\n${summary}` };
}

async function scanWebSearch(query: string | undefined): Promise<ToolResult> {
  if (!query) return { ok: false, output: "scan_web needs query" };
  try {
    const provider = resolveSearchProvider(process.env);
    const results = await provider.search(query, { maxResults: 10 });
    return appendCandidates(extractOpportunities(results, query, "web"), `web: ${query}`);
  } catch (err) {
    return { ok: true, output: `scan_web: search unavailable: ${(err as Error).message} — no opportunities added` };
  }
}

async function scanReddit(a: Parsed): Promise<ToolResult> {
  if (!a.query) return { ok: false, output: "scan_web from:reddit needs query" };
  const cookie = loadCookie("reddit");
  if (!cookie) return { ok: false, output: "no reddit cookie — import one (see /cookie) to scan reddit" };
  const r = await searchReddit({ query: a.query, subreddit: a.subreddit, limit: 10 }, cookie);
  if (!r.ok) return { ok: true, output: `scan_web reddit unavailable: ${r.error} — no opportunities added` };
  const where = a.subreddit ? `r/${a.subreddit} ` : "";
  return appendCandidates(extractOpportunities(fromReddit(r.posts), a.query, "reddit"), `reddit: ${where}${a.query}`);
}

async function scanRss(a: Parsed): Promise<ToolResult> {
  if (!a.feed) return { ok: false, output: "scan_web from:rss needs feed (a feed url)" };
  const r = await fetchFeed(a.feed);
  if (!r.ok) return { ok: true, output: `scan_web rss unavailable: ${r.error} — no opportunities added` };
  return appendCandidates(extractOpportunities(fromFeed(r.items), r.title, "rss"), `rss: ${r.title}`);
}

async function scanTwitter(a: Parsed): Promise<ToolResult> {
  if (!a.query) return { ok: false, output: "scan_web from:twitter needs query" };
  const r = await searchTwitter({ query: a.query, max: 20, latest: true }, loadCookie("twitter"));
  if (!r.ok) return { ok: true, output: `scan_web twitter unavailable: ${r.error} — no opportunities added` };
  return appendCandidates(extractOpportunities(fromTwitter(r.posts), a.query, "twitter"), `twitter: ${a.query}`);
}

function doScanWeb(a: Parsed): Promise<ToolResult> {
  if (a.from === "reddit") return scanReddit(a);
  if (a.from === "rss") return scanRss(a);
  if (a.from === "twitter") return scanTwitter(a);
  return scanWebSearch(a.query);
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
      "action:offer drafts a short offer pitch for a given opportunity (id required); " +
      "action:promote promotes a scored opportunity into a Money-OS prospect (id required) at stage:lead. " +
      "action:scan_web pulls live candidate opportunities from a reach source and appends them, scored by pain+buyer " +
      "heuristics (degrades gracefully when a source is unavailable). from:web (default) searches the web (query required); " +
      "from:reddit searches Reddit for pain signals (query required, optional subreddit — needs a reddit cookie); " +
      "from:rss reads a feed (feed url required); " +
      "from:twitter searches X/Twitter for pain signals (query required — via twitter-cli). " +
      "Use it to track, score, surface, and act on the highest-signal opportunities.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["record", "score", "list", "scan", "offer", "promote", "scan_web"], description: "record | score pain+buyer | list ranked | scan ranked | offer draft | promote to Money-OS prospect | scan_web live web scan" },
        id: { type: "string", description: "stable opportunity id slug" },
        title: { type: "string", description: "human label (for record)" },
        source: { type: "string", description: "where the signal came from (optional)" },
        note: { type: "string", description: "optional detail" },
        pain: { type: "number", description: "0..1 — problem severity: expensive/urgent/repeated/reachable" },
        buyer: { type: "number", description: "0..1 — buyer readiness: reachable/has-budget/good-timing" },
        query: { type: "string", description: "search query for scan_web (web/reddit)" },
        from: { type: "string", enum: ["web", "reddit", "rss", "twitter"], description: "scan_web source (default web)" },
        subreddit: { type: "string", description: "scan_web from:reddit — limit to a subreddit (optional)" },
        feed: { type: "string", description: "scan_web from:rss — the feed url" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `radar ${String(a.action ?? "")}`,
  async execute(raw) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "radar needs action: record | score | list | scan | offer | promote | scan_web" };
    if (p.data.action === "record") return doRecord(p.data);
    if (p.data.action === "score") return doScore(p.data);
    if (p.data.action === "scan") return doScan();
    if (p.data.action === "offer") return doOffer(p.data);
    if (p.data.action === "promote") return doPromote(p.data);
    if (p.data.action === "scan_web") return doScanWeb(p.data);
    return doList();
  },
};
