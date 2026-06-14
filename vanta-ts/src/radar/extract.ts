import type { SearchResult } from "../search/interface.js";
import type { Opportunity } from "./store.js";

// Pure module — no I/O. Converts web search results into candidate Opportunities.

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

/** Slug-safe id from a URL (path segment) or title fallback. */
function idFromResult(r: SearchResult, idx: number): string {
  try {
    const path = new URL(r.url).pathname.replace(/\/$/, "");
    const seg = path.split("/").filter(Boolean).at(-1) ?? "";
    const slug = seg.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
    if (slug.length > 3) return `web-${slug}`;
  } catch {
    // URL parse failed — fall through
  }
  const titleSlug = r.title
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .slice(0, 40);
  return `web-${titleSlug || `result-${idx}`}`;
}

/**
 * Turn web search results into candidate opportunities, scored from
 * pain and buyer signals in the title + snippet text.
 * Cap: 10 candidates. De-duped by URL then by generated id. Pure.
 */
export function extractOpportunities(
  results: SearchResult[],
  query: string,
): Opportunity[] {
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  const candidates: Opportunity[] = [];

  for (let i = 0; i < results.length && candidates.length < CAP; i++) {
    const r = results[i]!;
    if (seenUrls.has(r.url)) continue;
    seenUrls.add(r.url);

    const id = idFromResult(r, i);
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
      note: `via web scan: "${query}" — ${r.snippet.slice(0, 120)}`,
      status: "new",
      ts: new Date().toISOString(),
    };
    candidates.push(opp);
  }

  return candidates;
}
