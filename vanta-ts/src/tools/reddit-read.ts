import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { loadCookie } from "../reach/cookie.js";
import { formatPosts, formatThread } from "../reach/reddit-parse.js";
import { searchReddit, readRedditThread } from "../reach/reddit.js";

const Args = z.object({
  action: z.enum(["search", "read"]),
  query: z.string().optional(),
  subreddit: z.string().optional(),
  url: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const NO_COOKIE =
  "No Reddit cookie configured (anonymous access is blocked). Export your reddit.com session with Cookie-Editor and store it: see /cookie, then cookie_import for channel \"reddit\".";

async function doSearch(a: z.infer<typeof Args>, cookie: string): Promise<ToolResult> {
  if (!a.query) return { ok: false, output: "search needs a query" };
  const r = await searchReddit({ query: a.query, subreddit: a.subreddit, limit: a.limit }, cookie);
  return r.ok ? { ok: true, output: formatPosts(r.posts) } : { ok: false, output: `reddit search failed: ${r.error}` };
}

async function doRead(a: z.infer<typeof Args>, cookie: string): Promise<ToolResult> {
  if (!a.url) return { ok: false, output: "read needs a url (a reddit post permalink)" };
  const r = await readRedditThread(a.url, cookie);
  return r.ok ? { ok: true, output: formatThread(r.thread) } : { ok: false, output: `reddit read failed: ${r.error}` };
}

export const redditReadTool: Tool = {
  schema: {
    name: "reddit_read",
    description:
      "Search Reddit or read a post + its top comments. action:search {query, subreddit?, limit?} finds posts; " +
      "action:read {url} reads a post permalink + comments. Uses your stored reddit cookie (Reddit blocks anonymous access) — " +
      "returns the exact setup step if none is configured. Source-cited (permalinks).",
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
    if (!cookie) return { ok: false, output: NO_COOKIE };
    return parsed.data.action === "search" ? doSearch(parsed.data, cookie) : doRead(parsed.data, cookie);
  },
};
