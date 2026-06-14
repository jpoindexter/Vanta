import { parseFeed, feedTitle, type FeedItem } from "./rss-parse.js";

// Reusable RSS/Atom fetcher (shared by the rss_read tool + the radar scanner).

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchFeed(
  url: string,
): Promise<{ ok: true; title: string; items: FeedItem[] } | { ok: false; error: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "vanta-rss/1.0" } });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const xml = await res.text();
    return { ok: true, title: feedTitle(xml), items: parseFeed(xml) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
