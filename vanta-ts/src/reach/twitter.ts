import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { assertPublicUrl } from "../net/ssrf-guard.js";
import { extractAuth, parseTimeline, graphqlError, type TwitterPost } from "./twitter-parse.js";

// Native X/Twitter GraphQL client — no Python, no twitter-cli. Authenticates
// with the stored cookie (auth_token + ct0; ct0 is also the CSRF token). The
// GraphQL query IDs rotate, so they're resolved from env → cache → scrape
// (reach/twitter-heal.ts), making the channel self-healing.

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

export function loadQids(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(qidPath(env), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveQids(qids: Record<string, string>, env: NodeJS.ProcessEnv = process.env): void {
  writeFileSync(qidPath(env), JSON.stringify(qids, null, 2), { mode: 0o600 });
}

function resolveQid(op: string, env: NodeJS.ProcessEnv): string | null {
  return env[`VANTA_TWITTER_QID_${op.toUpperCase()}`] ?? loadQids(env)[op] ?? null;
}

function xHeaders(cookie: string, ct0: string, env: NodeJS.ProcessEnv): Record<string, string> {
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
  };
}

async function xGraphQL(
  op: string,
  variables: object,
  cookie: string,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const auth = extractAuth(cookie);
  if (!auth) return { ok: false, error: "twitter cookie missing auth_token/ct0 — re-import it" };
  const qid = resolveQid(op, env);
  if (!qid) return { ok: false, error: `no query id for ${op} — run reach heal twitter to fetch current ids` };
  const features = env.VANTA_TWITTER_FEATURES ?? JSON.stringify(FEATURES);
  const url = `https://x.com/i/api/graphql/${qid}/${op}?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(features)}`;
  const guard = await assertPublicUrl(url, { env });
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { headers: xHeaders(cookie, auth.ct0, env), signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `X returned HTTP ${res.status}${res.status === 403 ? " (cookie expired or blocked)" : ""}` };
    const json: unknown = await res.json();
    const ge = graphqlError(json);
    return ge ? { ok: false, error: ge } : { ok: true, value: json };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function searchTwitter(
  opts: { query: string; max?: number; latest?: boolean },
  cookie: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Posts> {
  if (!cookie) return { ok: false, error: "no twitter cookie" };
  const variables = { rawQuery: opts.query, count: opts.max ?? 20, querySource: "typed_query", product: opts.latest ? "Latest" : "Top" };
  const r = await xGraphQL("SearchTimeline", variables, cookie, env);
  return r.ok ? { ok: true, posts: parseTimeline(r.value) } : r;
}

export async function bookmarks(
  opts: { max?: number },
  cookie: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Posts> {
  if (!cookie) return { ok: false, error: "no twitter cookie" };
  const r = await xGraphQL("Bookmarks", { count: opts.max ?? 20, includePromotedContent: false }, cookie, env);
  return r.ok ? { ok: true, posts: parseTimeline(r.value) } : r;
}
