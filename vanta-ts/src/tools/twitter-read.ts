import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { loadCookie } from "../reach/cookie.js";
import { searchTwitter, bookmarks, type TwitterPost, type HealFn } from "../reach/twitter.js";
import { healTwitter } from "../reach/twitter-capture.js";

// Auto-heal on a 404 uses the channel's FULL heal — browser capture first, static
// bundle-scrape as fallback (the path proven to refresh X's rotated query ids) — not
// the bundle scrape alone. It loads its own cookie, so the passed one is unused.
const autoHeal: HealFn = (_cookie, env) => healTwitter(env);

const Args = z.object({
  action: z.enum(["search", "bookmarks"]),
  query: z.string().optional(),
  max: z.number().int().min(1).max(100).optional(),
  latest: z.boolean().optional(),
});

const NO_COOKIE =
  "No X/Twitter cookie configured. Export your x.com session with Cookie-Editor (it needs auth_token + ct0) " +
  'and store it: cookie_import channel "twitter" (see /cookie). Then run `reach heal twitter` once to fetch X\'s current query ids.';

function format(label: string, posts: TwitterPost[]): string {
  if (posts.length === 0) return `${label}: none found.`;
  return [
    `${label} — ${posts.length} tweet(s):`,
    ...posts.map((p, i) => `${i + 1}. @${p.handle} (♥${p.likes}): ${p.text.slice(0, 240)}\n   ${p.url}`),
  ].join("\n");
}

export const twitterReadTool: Tool = {
  schema: {
    name: "twitter_read",
    description:
      "Search X/Twitter or list your bookmarks — native GraphQL, no external CLI, keyless cookie auth. " +
      "action:search {query, max?, latest?} finds tweets; action:bookmarks {max?} lists your saved tweets. " +
      "Needs an x.com cookie (cookie_import channel \"twitter\") + current query ids (reach heal twitter). Source-cited.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["search", "bookmarks"] },
        query: { type: "string", description: "search: the query" },
        max: { type: "integer", minimum: 1, maximum: 100, description: "max tweets (default 20)" },
        latest: { type: "boolean", description: "search: newest first instead of top" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `twitter ${String(a.action ?? "")}${a.query ? `: ${String(a.query)}` : ""}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'twitter_read needs an "action" (search|bookmarks)' };
    const cookie = loadCookie("twitter");
    if (!cookie) return { ok: false, output: NO_COOKIE };
    const a = parsed.data;
    if (a.action === "bookmarks") {
      const r = await bookmarks({ max: a.max }, cookie, process.env, autoHeal);
      return r.ok ? { ok: true, output: format("Bookmarks", r.posts) } : { ok: false, output: `twitter bookmarks failed: ${r.error}` };
    }
    if (!a.query) return { ok: false, output: "search needs a query" };
    const r = await searchTwitter({ query: a.query, max: a.max, latest: a.latest }, cookie, process.env, autoHeal);
    return r.ok ? { ok: true, output: format(`Search "${a.query}"`, r.posts) } : { ok: false, output: `twitter search failed: ${r.error}` };
  },
};
