import type { SearchResult } from "../search/interface.js";
import type { Opportunity } from "./store.js";
import type { RedditPost } from "../reach/reddit-parse.js";
import type { FeedItem } from "../reach/rss-parse.js";

// Pure module — no I/O. Converts reach-channel results (web search, Reddit, RSS)
// into candidate Opportunities, scored from pain/buyer signals.

const CAP = 10;

const PAIN_WORDS = [
  "frustrated", "frustrating", "hate", "broken", "manual", "waste", "wasted",
  "slow", "expensive", "painful", "annoying", "tedious", "impossible",
  "nightmare", "struggle", "struggling", "problem", "issue", "bug", "fail",
  "failing", "crash", "crashes", "sucks", "terrible", "awful",
];

const BUYER_WORDS = [
  "enterprise", "team", "company", "startup", "business", "saas", "paid",
  "premium", "subscription", "budget", "spend", "hire", "tool", "solution",
  "platform", "software", "vendor", "service", "b2b", "customer",
];

/** Score 0..1 by counting pain/buyer keywords in combined title+snippet text. */
function scoreWords(text: string, words: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const w of words) {
    if (lower.includes(w)) hits++;
  }
  return Math.min(hits / 3, 1);
}

/** Slug-safe id from a URL (path segment) or title fallback, prefixed by source. */
function idFromResult(r: SearchResult, idx: number, source: string): string {
  try {
    const path = new URL(r.url).pathname.replace(/\/$/, "");
    const seg = path.split("/").filter(Boolean).at(-1) ?? "";
    const slug = seg.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
    if (slug.length > 3) return `${source}-${slug}`;
  } catch {
    // URL parse failed — fall through
  }
  const titleSlug = r.title
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 40);
  return `${source}-${titleSlug || `result-${idx}`}`;
}

/** Reddit posts → the common result shape (url = permalink, snippet = body/meta). */
export function fromReddit(posts: RedditPost[]): SearchResult[] {
  return posts.map((p) => ({
    title: p.title,
    url: `https://www.reddit.com${p.permalink}`,
    snippet: p.body || `r/${p.subreddit} · ↑${p.score} · ${p.comments} comments`,
  }));
}

/** RSS/Atom items → the common result shape. */
export function fromFeed(items: FeedItem[]): SearchResult[] {
  return items.map((it) => ({ title: it.title, url: it.link, snippet: it.summary }));
}

/**
 * Turn reach-channel results into candidate opportunities, scored from pain
 * and buyer signals in the title + snippet text. `source` (web/reddit/rss)
 * prefixes the id + the note. Cap: 10. De-duped by URL then id. Pure.
 */
export function extractOpportunities(
  results: SearchResult[],
  query: string,
  source = "web",
): Opportunity[] {
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  const candidates: Opportunity[] = [];

  for (let i = 0; i < results.length && candidates.length < CAP; i++) {
    const r = results[i]!;
    if (seenUrls.has(r.url)) continue;
    seenUrls.add(r.url);

    const id = idFromResult(r, i, source);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const combined = `${r.title} ${r.snippet}`;
    const pain = scoreWords(combined, PAIN_WORDS);
    const buyer = scoreWords(combined, BUYER_WORDS);

    const opp: Opportunity = {
      kind: "opportunity",
      id,
      title: r.title,
      source: r.url,
      pain,
      buyer,
      note: `via ${source} scan: "${query}" — ${r.snippet.slice(0, 120)}`,
      status: "new",
      ts: new Date().toISOString(),
    };
    candidates.push(opp);
  }

  return candidates;
}
