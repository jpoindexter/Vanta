import { extractQueryIds } from "./twitter-parse.js";
import { loadQids, saveQids } from "./twitter.js";
import type { HealResult } from "./heal.js";

// Native self-heal for the X channel: when X rotates its GraphQL query IDs and
// breaks calls, re-scrape the current IDs from X's own web JS bundles and cache
// them. No external tool — Vanta rebuilds the twitter integration itself.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 20_000;
const MAX_BUNDLES = 40;

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

/** Every client-web JS bundle URL referenced in a page or another bundle's text. */
export function bundleUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const m of text.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web[\w./-]+\.js/g)) {
    urls.add(m[0]);
  }
  return [...urls];
}

const REQUIRED_OPS = ["SearchTimeline", "Bookmarks"] as const;

type CrawlState = { merged: Record<string, string>; observed: Set<string>; seen: Set<string>; queue: string[] };

/** Fetch one bundle: merge its query ids, enqueue the bundles it references. */
async function crawlBundle(url: string, cookie: string | null, st: CrawlState): Promise<number> {
  const js = await get(url, cookie);
  if (!js) return 0;
  let found = 0;
  for (const [op, qid] of Object.entries(extractQueryIds(js))) {
    st.observed.add(op);
    if (st.merged[op] !== qid) found++;
    st.merged[op] = qid;
  }
  for (const next of bundleUrls(js)) if (!st.seen.has(next)) st.queue.push(next);
  return found;
}

/**
 * Re-scrape X's GraphQL query IDs into the cache (~/.vanta/twitter-qids.json).
 * Crawls TWO levels — the homepage's bundles, then the bundles THOSE reference —
 * because logged-in-only endpoints (Bookmarks) live in lazily-referenced bundles.
 * Pass the cookie so X serves the logged-in app (logged-out has no Bookmarks).
 * The reach channel's heal(). Best-effort; bounded by MAX_BUNDLES.
 */
export async function refreshQueryIds(
  cookie: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HealResult> {
  const html = await get("https://x.com/", cookie);
  if (!html) return { ok: false, ran: "fetch x.com", output: "could not reach x.com (network or block)" };

  const st: CrawlState = { merged: { ...loadQids(env) }, observed: new Set<string>(), seen: new Set<string>(), queue: bundleUrls(html) };
  let found = 0;
  while (st.queue.length > 0 && st.seen.size < MAX_BUNDLES) {
    const url = st.queue.shift()!;
    if (st.seen.has(url)) continue;
    st.seen.add(url);
    found += await crawlBundle(url, cookie, st);
  }

  saveQids(st.merged, env);
  const have = REQUIRED_OPS.filter((op) => st.observed.has(op));
  const missing = REQUIRED_OPS.filter((op) => !st.observed.has(op));
  return {
    ok: missing.length === 0,
    ran: `crawl ${st.seen.size} x.com bundles${cookie ? " (logged-in)" : " (logged-out — import a cookie for Bookmarks)"}`,
    output:
      `refreshed ${found} query id(s); observed live: ${have.join(", ") || "none"}` +
      (missing.length ? `; still missing live: ${missing.join(", ")} (set VANTA_TWITTER_QID_<OP> as a fallback)` : ""),
  };
}
