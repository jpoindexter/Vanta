import { parseFeed, feedTitle, type FeedItem } from "./rss-parse.js";

// Reusable RSS/Atom fetcher (shared by the rss_read tool + the radar scanner),
// with feed auto-discovery (Agent-Reach issue #322): if you point it at a site's
// homepage instead of its feed, it finds the <link rel=alternate> feed and fetches it.

const FETCH_TIMEOUT_MS = 15_000;

type FeedResult = { ok: true; title: string; items: FeedItem[] } | { ok: false; error: string };

async function getText(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "vanta-rss/1.0" } });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Find a feed URL in an HTML page's `<link rel="alternate" type="…rss/atom…">`.
 * Resolves it against the page URL. Pure. Returns null when no feed link exists.
 */
export function discoverFeed(html: string, baseUrl: string): string | null {
  for (const tag of html.match(/<link[^>]+>/gi) ?? []) {
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return href;
    }
  }
  return null;
}

/**
 * Fetch + parse a feed. If the URL is a site page (no feed items + a discoverable
 * feed link), follow the discovered feed once. `depth` guards the recursion.
 */
export async function fetchFeed(url: string, depth = 0): Promise<FeedResult> {
  const r = await getText(url);
  if (!r.ok) return r;
  const items = parseFeed(r.text);
  if (items.length === 0 && depth === 0) {
    const discovered = discoverFeed(r.text, url);
    if (discovered && discovered !== url) return fetchFeed(discovered, 1);
  }
  return { ok: true, title: feedTitle(r.text), items };
}
