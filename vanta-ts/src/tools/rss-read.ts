import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { parseFeed, feedTitle, type FeedItem } from "../reach/rss-parse.js";

const Args = z.object({
  url: z.string().url(),
  limit: z.number().int().min(1).max(100).optional(),
});

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 20;

function formatItems(title: string, items: FeedItem[]): string {
  if (items.length === 0) return `${title}: no items found (is this an RSS/Atom feed?)`;
  const rows = items.map((it, i) => {
    const when = it.date ? ` · ${it.date}` : "";
    const sum = it.summary ? `\n   ${it.summary.slice(0, 200)}` : "";
    return `${i + 1}. ${it.title}${when}\n   ${it.link}${sum}`;
  });
  return [`${title} — ${items.length} item(s)`, ...rows].join("\n");
}

export const rssReadTool: Tool = {
  schema: {
    name: "rss_read",
    description:
      "Read an RSS or Atom feed: fetch the feed URL and return its recent items (title, link, date, summary). " +
      "Zero-config, no API key. Use it to follow blogs, subreddit feeds (…/.rss), release notes, or news.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The feed URL (RSS or Atom)" },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Max items (default 20)" },
      },
      required: ["url"],
    },
  },
  describeForSafety: (a) => `read rss feed: ${String(a.url ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'rss_read needs a valid "url"' };
    const { url, limit = DEFAULT_LIMIT } = parsed.data;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "vanta-rss/1.0" } });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, output: `rss_read: ${url} returned HTTP ${res.status}` };
      const xml = await res.text();
      const items = parseFeed(xml).slice(0, limit);
      return { ok: true, output: formatItems(feedTitle(xml), items) };
    } catch (err) {
      return { ok: false, output: `rss_read failed: ${(err as Error).message}` };
    }
  },
};
