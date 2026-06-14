import { parseListing, parseThread, type RedditPost, type RedditComment } from "./reddit-parse.js";

// Reusable Reddit fetchers (shared by the reddit_read tool + the radar scanner).
// Reddit blocks anonymous access, so every call carries the stored cookie.

const FETCH_TIMEOUT_MS = 15_000;
const UA = "vanta-reach/1.0";

type Fetched = { ok: true; json: unknown } | { ok: false; error: string };

export async function fetchRedditJson(url: string, cookie: string): Promise<Fetched> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { cookie, "user-agent": UA } });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}${res.status === 403 ? " (cookie expired or IP-blocked)" : ""}` };
    }
    return { ok: true, json: await res.json() };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function redditSearchUrl(query: string, subreddit: string | undefined, limit: number): string {
  const base = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?restrict_sr=1&`
    : "https://www.reddit.com/search.json?";
  return `${base}q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance`;
}

export async function searchReddit(
  opts: { query: string; subreddit?: string; limit?: number },
  cookie: string,
): Promise<{ ok: true; posts: RedditPost[] } | { ok: false; error: string }> {
  const r = await fetchRedditJson(redditSearchUrl(opts.query, opts.subreddit, opts.limit ?? 10), cookie);
  return r.ok ? { ok: true, posts: parseListing(r.json) } : r;
}

export async function readRedditThread(
  url: string,
  cookie: string,
): Promise<{ ok: true; thread: { post: RedditPost | null; comments: RedditComment[] } } | { ok: false; error: string }> {
  const jsonUrl = url.replace(/\/?$/, "").replace(/(\.json)?$/, ".json");
  const r = await fetchRedditJson(jsonUrl, cookie);
  return r.ok ? { ok: true, thread: parseThread(r.json) } : r;
}
