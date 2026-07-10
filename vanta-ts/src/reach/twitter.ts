import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { assertPublicUrl } from "../net/ssrf-guard.js";
import { extractAuth, parseTimeline, graphqlError, type TwitterPost } from "./twitter-parse.js";
import { searchTwitterBrowser } from "./twitter-browser.js";

// Authenticated X/Twitter GraphQL client — no Python or external CLI. Native
// fetch is the fast path; search falls back to a real browser transport when
// X's anti-bot edge rejects the same request outside Chromium.

export type { TwitterPost };

// Public web-app bearer (stable for years); override via VANTA_TWITTER_BEARER.
const DEFAULT_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 20_000;

// X rejects a request whose `features` blob omits a flag it expects. This broad
// set covers search + bookmarks; override via VANTA_TWITTER_FEATURES (JSON).
const FEATURES: Record<string, boolean> = {
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  articles_preview_enabled: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
};

type Posts = { ok: true; posts: TwitterPost[] } | { ok: false; error: string };

function qidPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "twitter-qids.json");
}

function requestTemplatePath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "twitter-request-templates.json");
}

export type TwitterRequestTemplate = {
  qid: string;
  variables: Record<string, unknown>;
  features: Record<string, unknown>;
  fieldToggles: Record<string, unknown>;
  headers: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function loadQids(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(qidPath(env), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveQids(qids: Record<string, string>, env: NodeJS.ProcessEnv = process.env): void {
  mkdirSync(resolveVantaHome(env), { recursive: true, mode: 0o700 });
  writeFileSync(qidPath(env), JSON.stringify(qids, null, 2), { mode: 0o600 });
}

export function loadTwitterRequestTemplates(env: NodeJS.ProcessEnv = process.env): Record<string, TwitterRequestTemplate> {
  try {
    const raw: unknown = JSON.parse(readFileSync(requestTemplatePath(env), "utf8"));
    if (!isRecord(raw)) return {};
    const templates: Record<string, TwitterRequestTemplate> = {};
    for (const [op, value] of Object.entries(raw)) {
      if (!isRecord(value) || typeof value.qid !== "string" || !isRecord(value.variables) || !isRecord(value.features)) continue;
      templates[op] = {
        qid: value.qid,
        variables: value.variables,
        features: value.features,
        fieldToggles: isRecord(value.fieldToggles) ? value.fieldToggles : {},
        headers: isRecord(value.headers)
          ? Object.fromEntries(Object.entries(value.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
          : {},
      };
    }
    return templates;
  } catch {
    return {};
  }
}

export function saveTwitterRequestTemplates(
  templates: Record<string, TwitterRequestTemplate>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  mkdirSync(resolveVantaHome(env), { recursive: true, mode: 0o700 });
  writeFileSync(requestTemplatePath(env), JSON.stringify(templates, null, 2), { mode: 0o600 });
}

export function twitterQueryId(op: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return env[`VANTA_TWITTER_QID_${op.toUpperCase()}`] ?? loadQids(env)[op] ?? loadTwitterRequestTemplates(env)[op]?.qid ?? null;
}

function replayHeaders(template: TwitterRequestTemplate | undefined): Record<string, string> {
  const headers = template?.headers ?? {};
  return Object.fromEntries(Object.entries(headers).filter(([name]) => ["x-client-transaction-id", "referer"].includes(name.toLowerCase())));
}

function xHeaders(cookie: string, ct0: string, env: NodeJS.ProcessEnv, template?: TwitterRequestTemplate): Record<string, string> {
  return {
    authorization: `Bearer ${env.VANTA_TWITTER_BEARER ?? DEFAULT_BEARER}`,
    "x-csrf-token": ct0,
    cookie,
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "content-type": "application/json",
    "user-agent": UA,
    accept: "*/*",
    ...replayHeaders(template),
  };
}

// Injected so twitter.ts stays free of a twitter-heal import (heal imports this
// file → injection avoids the cycle). The tool passes the real refreshQueryIds.
export type HealFn = (cookie: string | null, env: NodeJS.ProcessEnv) => Promise<unknown>;

type FetchOutcome = { ok: boolean; status: number; json: unknown } | { error: string };

type GqlCtx = { cookie: string; env: NodeJS.ProcessEnv; heal?: HealFn };
type GqlResult = { ok: true; value: unknown } | { ok: false; error: string };

type RequestConfig = { qid: string; template?: TwitterRequestTemplate };

function requestConfig(op: string, env: NodeJS.ProcessEnv): RequestConfig | null {
  const qid = twitterQueryId(op, env);
  return qid ? { qid, template: loadTwitterRequestTemplates(env)[op] } : null;
}

function requestFingerprint(config: RequestConfig): string {
  return JSON.stringify(config);
}

/** One GraphQL request: build the URL, SSRF-guard it, fetch. Returns the raw
 *  status (+ body on success) or a guard/network error string. */
async function fetchOnce(
  op: string,
  variables: object,
  req: { config: RequestConfig; ct0: string; cookie: string; env: NodeJS.ProcessEnv },
): Promise<FetchOutcome> {
  const { config, ct0, cookie, env } = req;
  const mergedVariables = { ...config.template?.variables, ...variables };
  const features = env.VANTA_TWITTER_FEATURES ?? JSON.stringify(config.template?.features ?? FEATURES);
  const toggles = config.template?.fieldToggles ?? {};
  const toggleQuery = Object.keys(toggles).length
    ? `&fieldToggles=${encodeURIComponent(JSON.stringify(toggles))}`
    : "";
  const url = `https://x.com/i/api/graphql/${config.qid}/${op}?variables=${encodeURIComponent(JSON.stringify(mergedVariables))}&features=${encodeURIComponent(features)}${toggleQuery}`;
  const guard = await assertPublicUrl(url, { env });
  if (!guard.ok) return { error: guard.error };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { headers: xHeaders(cookie, ct0, env, config.template), signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, json: res.ok ? await res.json() : undefined };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

const stale404 = (op: string): string =>
  `X returned HTTP 404 — the ${op} query id or request shape is stale and auto-heal did not restore a live request ` +
  `(X changed its web app, request features, or the x.com cookie expired). Re-import a fresh cookie ` +
  `(cookie_import channel "twitter"), or fall back to web_search "site:x.com <query>".`;

async function retryStaleRequest(
  op: string,
  variables: object,
  ctx: Required<Pick<GqlCtx, "cookie" | "env" | "heal">>,
  fingerprint: string,
): Promise<GqlResult> {
  await ctx.heal(ctx.cookie, ctx.env);
  const refreshed = requestConfig(op, ctx.env);
  return refreshed && requestFingerprint(refreshed) !== fingerprint
    ? xGraphQL(op, variables, { cookie: ctx.cookie, env: ctx.env })
    : { ok: false, error: stale404(op) };
}

async function xGraphQL(
  op: string,
  variables: object,
  ctx: GqlCtx,
): Promise<GqlResult> {
  const { cookie, env, heal } = ctx;
  const auth = extractAuth(cookie);
  if (!auth) return { ok: false, error: "twitter cookie missing auth_token/ct0 — re-import it" };
  const config = requestConfig(op, env);
  if (!config) return { ok: false, error: `no query id for ${op} — run reach heal twitter to fetch current ids` };
  const fingerprint = requestFingerprint(config);
  const res = await fetchOnce(op, variables, { config, ct0: auth.ct0, cookie, env });
  if ("error" in res) return { ok: false, error: res.error };
  // 404 = X rotated this op's persisted-query hash. Self-heal once (the channel
  // claims to be self-healing; wire it to the signal): re-scrape current ids, and
  // retry ONLY if the id actually changed — else the retry would 404 identically.
  if (res.status === 404 && heal) {
    return retryStaleRequest(op, variables, { cookie, env, heal }, fingerprint);
  }
  if (!res.ok) return { ok: false, error: `X returned HTTP ${res.status}${res.status === 403 ? " (cookie expired or blocked)" : ""}` };
  const ge = graphqlError(res.json);
  return ge ? { ok: false, error: ge } : { ok: true, value: res.json };
}

export async function searchTwitter(
  opts: { query: string; max?: number; latest?: boolean },
  cookie: string | null,
  env: NodeJS.ProcessEnv = process.env,
  heal?: HealFn,
): Promise<Posts> {
  if (!cookie) return { ok: false, error: "no twitter cookie" };
  const variables = { rawQuery: opts.query, count: opts.max ?? 20, querySource: "typed_query", product: opts.latest ? "Latest" : "Top" };
  const r = await xGraphQL("SearchTimeline", variables, { cookie, env, heal });
  if (r.ok) return { ok: true, posts: parseTimeline(r.value) };
  if (!/HTTP 404|request shape is stale/.test(r.error) || env.VANTA_TWITTER_BROWSER_FALLBACK === "0") return r;
  const browser = await searchTwitterBrowser(opts, cookie);
  return browser.ok
    ? browser
    : {
        ok: false,
        error: `${r.error}; browser fallback failed: ${browser.error}. ` +
          `Use web_search "site:x.com ${opts.query}" as the unprivileged fallback.`,
      };
}

export async function bookmarks(
  opts: { max?: number },
  cookie: string | null,
  env: NodeJS.ProcessEnv = process.env,
  heal?: HealFn,
): Promise<Posts> {
  if (!cookie) return { ok: false, error: "no twitter cookie" };
  const r = await xGraphQL("Bookmarks", { count: opts.max ?? 20, includePromotedContent: false }, { cookie, env, heal });
  return r.ok ? { ok: true, posts: parseTimeline(r.value) } : r;
}
