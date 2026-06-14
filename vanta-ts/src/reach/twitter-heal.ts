import { extractQueryIds } from "./twitter-parse.js";
import { loadQids, saveQids } from "./twitter.js";
import type { HealResult } from "./heal.js";

// Native self-heal for the X channel: when X rotates its GraphQL query IDs and
// breaks calls, re-scrape the current IDs from X's own web JS bundles and cache
// them. No external tool — Vanta rebuilds the twitter integration itself.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 20_000;
const MAX_BUNDLES = 12;

async function get(url: string, cookie: string | null): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const headers: Record<string, string> = { "user-agent": UA };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** The client-web JS bundle URLs referenced by X's homepage (where query IDs live). */
export function bundleUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web[\w./-]+\.js/g)) {
    urls.add(m[0]);
  }
  return [...urls].slice(0, MAX_BUNDLES);
}

/**
 * Re-scrape X's GraphQL query IDs into the cache (~/.vanta/twitter-qids.json).
 * Best-effort: fetches the homepage, then its JS bundles, merging every
 * operation→queryId pair it finds. The reach channel's heal().
 */
export async function refreshQueryIds(
  cookie: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HealResult> {
  const html = await get("https://x.com/", cookie);
  if (!html) return { ok: false, ran: "fetch x.com", output: "could not reach x.com (network or block)" };
  const merged: Record<string, string> = { ...loadQids(env) };
  let found = 0;
  for (const url of bundleUrls(html)) {
    const js = await get(url, cookie);
    if (!js) continue;
    for (const [op, qid] of Object.entries(extractQueryIds(js))) {
      if (merged[op] !== qid) found++;
      merged[op] = qid;
    }
  }
  saveQids(merged, env);
  const have = ["SearchTimeline", "Bookmarks"].filter((op) => merged[op]);
  return {
    ok: have.length > 0,
    ran: "scrape x.com web bundles",
    output:
      have.length > 0
        ? `refreshed ${found} query id(s); have: ${have.join(", ")} of SearchTimeline/Bookmarks`
        : "scraped bundles but found no SearchTimeline/Bookmarks ids — set VANTA_TWITTER_QID_BOOKMARKS / _SEARCHTIMELINE manually",
  };
}
