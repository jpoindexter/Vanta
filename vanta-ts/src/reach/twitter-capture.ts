import { loadCookie } from "./cookie.js";
import {
  loadQids,
  loadTwitterRequestTemplates,
  saveQids,
  saveTwitterRequestTemplates,
  type TwitterRequestTemplate,
} from "./twitter.js";
import { refreshQueryIds } from "./twitter-heal.js";
import { openWithSession, type SafeRequestDetail } from "./browser-session.js";
import type { HealResult } from "./heal.js";

// X-specific self-heal: drive the general authenticated browser (browser-session)
// to x.com pages and read the live GraphQL query IDs out of the requests the page
// makes. Real browser → real webpack → real calls, so the rotating IDs (Bookmarks,
// SearchTimeline) just appear. Falls back to the static bundle scrape.

// Pages whose loads trigger the ops we want captured.
const PAGES = ["https://x.com/i/bookmarks", "https://x.com/search?q=ai&src=typed_query&f=live"];
const REQUIRED_OPS = ["SearchTimeline", "Bookmarks"] as const;

/** Extract {op, qid} from an X GraphQL request URL. Pure. */
export function graphqlOp(url: string): { op: string; qid: string } | null {
  const m = /\/i\/api\/graphql\/([^/?]+)\/(\w+)/.exec(url);
  return m && m[1] && m[2] ? { qid: m[1], op: m[2] } : null;
}

export function capturedQueryIds(
  prior: Record<string, string>,
  requestUrls: string[],
): { merged: Record<string, string>; observed: string[]; changed: number } {
  const merged = { ...prior };
  const observed = new Set<string>();
  let changed = 0;
  for (const reqUrl of requestUrls) {
    const item = graphqlOp(reqUrl);
    if (!item) continue;
    observed.add(item.op);
    if (merged[item.op] !== item.qid) changed += 1;
    merged[item.op] = item.qid;
  }
  return { merged, observed: [...observed], changed };
}

function parseObjectParam(url: URL, name: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(url.searchParams.get(name) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function capturedRequestTemplates(
  requestUrls: string[],
  requestDetails: SafeRequestDetail[] = [],
): Record<string, TwitterRequestTemplate> {
  const templates: Record<string, TwitterRequestTemplate> = {};
  for (const requestUrl of requestUrls) {
    const item = graphqlOp(requestUrl);
    if (!item) continue;
    const url = new URL(requestUrl);
    templates[item.op] = {
      qid: item.qid,
      variables: parseObjectParam(url, "variables"),
      features: parseObjectParam(url, "features"),
      fieldToggles: parseObjectParam(url, "fieldToggles"),
      headers: requestDetails.find((detail) => detail.url === requestUrl)?.headers ?? {},
    };
  }
  return templates;
}

/** Drive a headless browser over x.com pages to capture live query IDs into the cache. */
export async function captureQueryIds(
  cookie: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HealResult> {
  if (!cookie) return { ok: false, ran: "capture", output: "no twitter cookie to drive the browser" };
  const requests: string[] = [];
  const requestDetails: SafeRequestDetail[] = [];
  for (const url of PAGES) {
    const r = await openWithSession(url, cookie);
    if (!r.ok) return { ok: false, ran: "browser capture", output: r.error };
    requests.push(...r.requests);
    requestDetails.push(...(r.requestDetails ?? []));
  }
  const captured = capturedQueryIds(loadQids(env), requests);
  const templates = capturedRequestTemplates(requests, requestDetails);
  if (captured.observed.length) {
    saveQids(captured.merged, env);
    saveTwitterRequestTemplates({ ...loadTwitterRequestTemplates(env), ...templates }, env);
  }
  const missing = REQUIRED_OPS.filter((op) => !captured.observed.includes(op));
  return {
    ok: missing.length === 0,
    ran: "browser capture (playwright)",
    output: `observed ${captured.observed.length} live operation(s), refreshed ${captured.changed} id(s)` +
      `; have: ${captured.observed.join(", ") || "none"}` +
      (missing.length ? `; still missing live: ${missing.join(", ")}` : ""),
  };
}

/** The twitter channel's heal: browser capture first, static bundle scrape as fallback. */
export async function healTwitter(env: NodeJS.ProcessEnv = process.env): Promise<HealResult> {
  const cookie = loadCookie("twitter", env);
  const captured = await captureQueryIds(cookie, env);
  if (captured.ok) return captured;
  const scraped = await refreshQueryIds(cookie, env);
  return { ...scraped, output: `${captured.output}; fell back → ${scraped.output}` };
}
