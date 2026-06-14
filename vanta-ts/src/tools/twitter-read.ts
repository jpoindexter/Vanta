import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { loadCookie } from "../reach/cookie.js";
import { searchTwitter, type TwitterPost } from "../reach/twitter.js";

const Args = z.object({
  action: z.enum(["search"]),
  query: z.string().optional(),
  max: z.number().int().min(1).max(50).optional(),
  latest: z.boolean().optional(),
});

const NOT_INSTALLED =
  "twitter-cli is not installed. Install it: `uv tool install twitter-cli` (or `pipx install twitter-cli`). " +
  "It reads your logged-in browser session (Brave/Chrome/Firefox) or a stored twitter cookie (cookie_import channel \"twitter\").";

function format(posts: TwitterPost[]): string {
  if (posts.length === 0) return "No tweets found.";
  return [
    `${posts.length} tweet(s):`,
    ...posts.map((p, i) => `${i + 1}. @${p.handle} (♥${p.likes}): ${p.text.slice(0, 220)}\n   ${p.url}`),
  ].join("\n");
}

export const twitterReadTool: Tool = {
  schema: {
    name: "twitter_read",
    description:
      "Search X/Twitter for tweets (via twitter-cli — keyless cookie auth, no paid API). " +
      "action:search {query, max?, latest?} returns cited tweets ranked by engagement (or newest with latest:true). " +
      "Reads your logged-in browser session or a stored twitter cookie. Install: `uv tool install twitter-cli`.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search"] },
        query: { type: "string", description: "the search query" },
        max: { type: "integer", minimum: 1, maximum: 50, description: "max tweets (default 20)" },
        latest: { type: "boolean", description: "newest first instead of top/engagement" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `twitter ${String(a.action ?? "")}${a.query ? `: ${String(a.query)}` : ""}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'twitter_read needs an "action" (search) + query' };
    if (!parsed.data.query) return { ok: false, output: "search needs a query" };
    const r = await searchTwitter(
      { query: parsed.data.query, max: parsed.data.max, latest: parsed.data.latest },
      loadCookie("twitter"),
    );
    if (!r.ok) return { ok: false, output: r.error === "twitter-cli not installed" ? NOT_INSTALLED : `twitter search failed: ${r.error}` };
    return { ok: true, output: format(r.posts) };
  },
};
