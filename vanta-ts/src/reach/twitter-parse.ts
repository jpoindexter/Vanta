// Pure parsers for X/Twitter's GraphQL responses + web bundle. No I/O — so the
// brittle, shape-dependent bits are fully unit-tested against fixtures. The
// native client (twitter.ts) does the fetching.

export type TwitterPost = { text: string; handle: string; url: string; likes: number };

/** Pull auth_token + ct0 from a stored cookie header (ct0 doubles as the CSRF token). Pure. */
export function extractAuth(cookieHeader: string): { authToken: string; ct0: string } | null {
  const find = (k: string) => new RegExp(`(?:^|;\\s*)${k}=([^;]+)`).exec(cookieHeader)?.[1];
  const authToken = find("auth_token");
  const ct0 = find("ct0");
  return authToken && ct0 ? { authToken, ct0 } : null;
}

/**
 * Scrape GraphQL operation→queryId pairs from X's web JS bundle. The IDs rotate;
 * this lets the channel self-heal by re-reading them from X's own app. Pure.
 * Matches both `queryId:"X",operationName:"Op"` and the reversed order.
 */
export function extractQueryIds(js: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of js.matchAll(/queryId:"([^"]+)",operationName:"(\w+)"/g)) {
    if (m[1] && m[2]) out[m[2]] = m[1];
  }
  // Reversed order; the negative lookahead stops a match spanning into the next
  // operation (so op A can't grab op B's queryId).
  for (const m of js.matchAll(/operationName:"(\w+)"(?:(?!operationName:)[\s\S]){0,200}?queryId:"([^"]+)"/g)) {
    if (m[1] && m[2] && !out[m[1]]) out[m[1]] = m[2];
  }
  return out;
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(o: Record<string, unknown>, k: string): string {
  return typeof o[k] === "string" ? (o[k] as string) : "";
}
function num(o: Record<string, unknown>, k: string): number {
  return typeof o[k] === "number" ? (o[k] as number) : 0;
}

/** Build a post from one GraphQL tweet `result` node (handles the legacy shape). */
function tweetFrom(result: Record<string, unknown>): TwitterPost {
  const inner = result.tweet ? rec(result.tweet) : result; // TweetWithVisibilityResults wraps .tweet
  const legacy = rec(inner.legacy);
  const id = str(inner, "rest_id") || str(legacy, "id_str");
  const userLegacy = rec(rec(rec(rec(inner.core).user_results).result).legacy);
  const handle = str(userLegacy, "screen_name");
  return {
    text: str(legacy, "full_text"),
    handle,
    likes: num(legacy, "favorite_count"),
    url: handle && id ? `https://x.com/${handle}/status/${id}` : "",
  };
}

/** Recursively collect every tweet result node anywhere in the response. */
function collect(node: unknown, out: TwitterPost[]): void {
  if (Array.isArray(node)) {
    for (const x of node) collect(x, out);
    return;
  }
  const o = rec(node);
  if (Object.keys(o).length === 0) return;
  if (typeof rec(o.legacy).full_text === "string") out.push(tweetFrom(o));
  for (const v of Object.values(o)) collect(v, out);
}

/**
 * Parse a GraphQL timeline response (search / bookmarks / detail) into posts.
 * Walks the whole tree for tweet nodes, so it survives X reshuffling the
 * instructions/entries wrappers. Deduped by url. Pure, tolerant, never throws.
 */
export function parseTimeline(json: unknown): TwitterPost[] {
  const collected: TwitterPost[] = [];
  collect(json, collected);
  const seen = new Set<string>();
  const out: TwitterPost[] = [];
  for (const p of collected) {
    if (p.text && p.url && !seen.has(p.url)) {
      seen.add(p.url);
      out.push(p);
    }
  }
  return out;
}

/** Surface a GraphQL `errors[]` message when X rejects a request. Pure. */
export function graphqlError(json: unknown): string | null {
  const errors = rec(json).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return str(rec(errors[0]), "message") || "twitter graphql error";
}
