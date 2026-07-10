import { openWithSession, type CapturedJsonResponse } from "./browser-session.js";
import { graphqlError, parseTimeline, type TwitterPost } from "./twitter-parse.js";

type SearchOptions = { query: string; max?: number; latest?: boolean };
type Posts = { ok: true; posts: TwitterPost[] } | { ok: false; error: string };

/** Build the same public search page that emits SearchTimeline in X's web app. */
export function twitterSearchPage(opts: SearchOptions): string {
  const url = new URL("https://x.com/search");
  url.searchParams.set("q", opts.query);
  url.searchParams.set("src", "typed_query");
  if (opts.latest) url.searchParams.set("f", "live");
  return url.toString();
}

export function postsFromBrowserResponses(
  responses: CapturedJsonResponse[],
  max = 20,
): Posts {
  const response = responses.findLast((item) => item.url.includes("/SearchTimeline"));
  if (!response) return { ok: false, error: "X browser search emitted no SearchTimeline response" };
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: `X browser search returned HTTP ${response.status}` };
  }
  const gqlError = graphqlError(response.json);
  return gqlError
    ? { ok: false, error: gqlError }
    : { ok: true, posts: parseTimeline(response.json).slice(0, max) };
}

/** Use X's authenticated web transport when its anti-bot edge rejects native fetch. */
export async function searchTwitterBrowser(
  opts: SearchOptions,
  cookie: string,
): Promise<Posts> {
  const result = await openWithSession(twitterSearchPage(opts), cookie, {
    captureJson: (url) => url.includes("/SearchTimeline"),
  });
  return result.ok
    ? postsFromBrowserResponses(result.responses ?? [], opts.max)
    : { ok: false, error: `X browser search failed: ${result.error}` };
}
