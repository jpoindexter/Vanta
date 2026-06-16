import type { ToolResult } from "./types.js";
import { appendRadar, type Opportunity } from "../radar/store.js";
import { extractOpportunities, fromReddit, fromFeed, fromTwitter } from "../radar/extract.js";
import { resolveSearchProvider } from "../search/index.js";
import { loadCookie } from "../reach/cookie.js";
import { searchReddit } from "../reach/reddit.js";
import { fetchFeed } from "../reach/rss.js";
import { searchTwitter } from "../reach/twitter.js";

// scan_web action handlers for the radar tool. Extracted from radar.ts (size gate).

/** Append candidates to the radar + summarize. Shared by every scan source. */
export async function appendCandidates(candidates: Opportunity[], label: string): Promise<ToolResult> {
  if (!candidates.length) return { ok: true, output: `scan_web (${label}): no candidates found — nothing added` };
  for (const opp of candidates) await appendRadar(opp);
  const summary = candidates
    .slice(0, 5)
    .map((o) => `  • ${o.id} — ${o.title} (pain=${o.pain?.toFixed(1)} buyer=${o.buyer?.toFixed(1)})`)
    .join("\n");
  return { ok: true, output: `scan_web (${label}): added ${candidates.length} candidate(s)\n${summary}` };
}

export async function scanWebSearch(query: string | undefined): Promise<ToolResult> {
  if (!query) return { ok: false, output: "scan_web needs query" };
  try {
    const provider = resolveSearchProvider(process.env);
    const results = await provider.search(query, { maxResults: 10 });
    return appendCandidates(extractOpportunities(results, query, "web"), `web: ${query}`);
  } catch (err) {
    return { ok: true, output: `scan_web: search unavailable: ${(err as Error).message} — no opportunities added` };
  }
}

type ScanArgs = { query?: string; subreddit?: string; feed?: string; from?: string };

export async function scanReddit(a: ScanArgs): Promise<ToolResult> {
  if (!a.query) return { ok: false, output: "scan_web from:reddit needs query" };
  const cookie = loadCookie("reddit");
  if (!cookie) return { ok: false, output: "no reddit cookie — import one (see /cookie) to scan reddit" };
  const r = await searchReddit({ query: a.query, subreddit: a.subreddit, limit: 10 }, cookie);
  if (!r.ok) return { ok: true, output: `scan_web reddit unavailable: ${r.error} — no opportunities added` };
  const where = a.subreddit ? `r/${a.subreddit} ` : "";
  return appendCandidates(extractOpportunities(fromReddit(r.posts), a.query, "reddit"), `reddit: ${where}${a.query}`);
}

export async function scanRss(a: ScanArgs): Promise<ToolResult> {
  if (!a.feed) return { ok: false, output: "scan_web from:rss needs feed (a feed url)" };
  const r = await fetchFeed(a.feed);
  if (!r.ok) return { ok: true, output: `scan_web rss unavailable: ${r.error} — no opportunities added` };
  return appendCandidates(extractOpportunities(fromFeed(r.items), r.title, "rss"), `rss: ${r.title}`);
}

export async function scanTwitter(a: ScanArgs): Promise<ToolResult> {
  if (!a.query) return { ok: false, output: "scan_web from:twitter needs query" };
  const r = await searchTwitter({ query: a.query, max: 20, latest: true }, loadCookie("twitter"));
  if (!r.ok) return { ok: true, output: `scan_web twitter unavailable: ${r.error} — no opportunities added` };
  return appendCandidates(extractOpportunities(fromTwitter(r.posts), a.query, "twitter"), `twitter: ${a.query}`);
}

export function doScanWeb(a: ScanArgs): Promise<ToolResult> {
  if (a.from === "reddit") return scanReddit(a);
  if (a.from === "rss") return scanRss(a);
  if (a.from === "twitter") return scanTwitter(a);
  return scanWebSearch(a.query);
}
