import { loadCookie } from "./cookie.js";
import { loadQids, saveQids } from "./twitter.js";
import { refreshQueryIds } from "./twitter-heal.js";
import { openWithSession } from "./browser-session.js";
import type { HealResult } from "./heal.js";

// X-specific self-heal: drive the general authenticated browser (browser-session)
// to x.com pages and read the live GraphQL query IDs out of the requests the page
// makes. Real browser → real webpack → real calls, so the rotating IDs (Bookmarks,
// SearchTimeline) just appear. Falls back to the static bundle scrape.

// Pages whose loads trigger the ops we want captured.
const PAGES = ["https://x.com/i/bookmarks", "https://x.com/search?q=ai&src=typed_query&f=live"];

/** Extract {op, qid} from an X GraphQL request URL. Pure. */
export function graphqlOp(url: string): { op: string; qid: string } | null {
  const m = /\/i\/api\/graphql\/([^/?]+)\/(\w+)/.exec(url);
  return m && m[1] && m[2] ? { qid: m[1], op: m[2] } : null;
}

/** Drive a headless browser over x.com pages to capture live query IDs into the cache. */
export async function captureQueryIds(
  cookie: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HealResult> {
  if (!cookie) return { ok: false, ran: "capture", output: "no twitter cookie to drive the browser" };
  const found: Record<string, string> = { ...loadQids(env) };
  let n = 0;
  for (const url of PAGES) {
    const r = await openWithSession(url, cookie);
    if (!r.ok) return { ok: false, ran: "browser capture", output: r.error };
    for (const reqUrl of r.requests) {
      const g = graphqlOp(reqUrl);
      if (g && found[g.op] !== g.qid) {
        found[g.op] = g.qid;
        n++;
      }
    }
  }
  saveQids(found, env);
  const have = ["SearchTimeline", "Bookmarks"].filter((op) => found[op]);
  return { ok: have.length > 0, ran: "browser capture (playwright)", output: `captured ${n} live query id(s); have: ${have.join(", ") || "none"}` };
}

/** The twitter channel's heal: browser capture first, static bundle scrape as fallback. */
export async function healTwitter(env: NodeJS.ProcessEnv = process.env): Promise<HealResult> {
  const cookie = loadCookie("twitter", env);
  const captured = await captureQueryIds(cookie, env);
  if (captured.ok) return captured;
  const scraped = await refreshQueryIds(cookie, env);
  return { ...scraped, output: `${captured.output}; fell back → ${scraped.output}` };
}
