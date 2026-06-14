import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { loadCookie } from "../reach/cookie.js";
import { formatPosts, formatThread } from "../reach/reddit-parse.js";
import { searchReddit, readRedditThread } from "../reach/reddit.js";
import { openWithSession } from "../reach/browser-session.js";

const Args = z.object({
  action: z.enum(["search", "read"]),
  query: z.string().optional(),
  subreddit: z.string().optional(),
  url: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const FALLBACK_MAX = 12_000;
const COOKIE_HINT = ' — store one: cookie_import {channel:"reddit", browser:"brave"} (or see /cookie)';

/** The reddit search PAGE url (rendered in the browser fallback). Pure. */
export function redditSearchPageUrl(query: string, subreddit?: string): string {
  const base = subreddit
    ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search/`
    : "https://www.reddit.com/search/";
  return `${base}?q=${encodeURIComponent(query)}${subreddit ? "&restrict_sr=1" : ""}&sort=relevance`;
}

/** Fallback: render the page in a real browser with the session when .json is blocked. */
async function browserFallback(url: string, cookie: string | null): Promise<ToolResult> {
  const r = await openWithSession(url, cookie);
  if (!r.ok) return { ok: false, output: r.error };
  const text = r.text.slice(0, FALLBACK_MAX);
  return { ok: true, output: text ? `(reddit .json blocked — via browser session)\n${text}` : "(browser rendered no visible text)" };
}

async function doSearch(a: z.infer<typeof Args>, cookie: string | null): Promise<ToolResult> {
  if (!a.query) return { ok: false, output: "search needs a query" };
  const r = await searchReddit({ query: a.query, subreddit: a.subreddit, limit: a.limit }, cookie ?? "");
  if (r.ok) return { ok: true, output: formatPosts(r.posts) };
  const fb = await browserFallback(redditSearchPageUrl(a.query, a.subreddit), cookie);
  return fb.ok ? fb : { ok: false, output: `reddit search failed: ${r.error}; browser fallback: ${fb.output}${cookie ? "" : COOKIE_HINT}` };
}

async function doRead(a: z.infer<typeof Args>, cookie: string | null): Promise<ToolResult> {
  if (!a.url) return { ok: false, output: "read needs a url (a reddit post permalink)" };
  const r = await readRedditThread(a.url, cookie ?? "");
  if (r.ok) return { ok: true, output: formatThread(r.thread) };
  const fb = await browserFallback(a.url, cookie);
  return fb.ok ? fb : { ok: false, output: `reddit read failed: ${r.error}; browser fallback: ${fb.output}${cookie ? "" : COOKIE_HINT}` };
}

export const redditReadTool: Tool = {
  schema: {
    name: "reddit_read",
    description:
      "Search Reddit or read a post + its top comments. action:search {query, subreddit?, limit?} finds posts; " +
      "action:read {url} reads a post permalink + comments. Uses Reddit's .json API with your stored cookie; if that's " +
      "blocked (403 / no cookie), FALLS BACK to rendering the page in a real browser with your session. Source-cited.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "read"] },
        query: { type: "string", description: "search: the query" },
        subreddit: { type: "string", description: "search: limit to a subreddit (optional)" },
        url: { type: "string", description: "read: a reddit post permalink" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "search: max posts (default 10)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `reddit ${String(a.action ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'reddit_read needs an "action" (search|read)' };
    const cookie = loadCookie("reddit");
    return parsed.data.action === "search" ? doSearch(parsed.data, cookie) : doRead(parsed.data, cookie);
  },
};
