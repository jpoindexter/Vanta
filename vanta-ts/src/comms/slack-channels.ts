// VANTA-SLACK-CHANNEL-SUGGEST (live layer) — the network/secret boundary the pure
// repl/slack-suggest.ts slice deliberately left injected. This module owns the live
// Slack `conversations.list` fetch and the in-memory channel cache the composer reads
// while you type `#`; the ranking/parsing/formatting stays pure in slack-suggest.ts
// (reused here, never re-implemented).
//
// Mirrors google/client.ts's authed-fetch-with-token shape: a bearer token attached
// to a typed fetch, the response handed to a tolerant parser. The token is the
// operator's runtime requirement — exactly like gmail/calendar's Google OAuth — so
// production needs a real `VANTA_SLACK_TOKEN` at runtime, while tests inject a mock
// `fetchJson` returning a fixture body (fetch+parse verified offline, no network).
//
// SECURITY: the Slack bot token is a SECRET. It is read ONLY from the environment in
// `slackToken` (no literal anywhere — gitleaks-safe; no `const token = "xoxb-…"`).
// Every failure mode is a value, never a throw: a Slack API error, a malformed body,
// or a network exception all collapse to `[]`, so a missing/expired token can never
// crash the composer keystroke path.

import {
  parseChannelList,
  type SlackChannel,
} from "../repl/slack-suggest.js";

/** Slack `conversations.list` endpoint — public + private, unarchived skipped at parse. */
const SLACK_CONVERSATIONS_LIST =
  "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=1000&exclude_archived=false";

/** Default channel-cache TTL — refetch at most once a minute so keystrokes don't hit Slack. */
export const DEFAULT_CACHE_TTL_MS = 60_000;

/**
 * A JSON-returning authed fetch (INJECTED). `realSlackFetch` is the live impl;
 * tests pass a mock returning a fixture `{ok:true,channels:[...]}`. It receives the
 * URL + headers and resolves the parsed JSON body; it may reject on a network error
 * (the caller catches and returns `[]`).
 */
export type SlackFetchJson = (
  url: string,
  headers: Record<string, string>,
) => Promise<unknown>;

/** Everything `fetchSlackChannels` needs — the injected fetch + the resolved token. */
export interface SlackChannelDeps {
  readonly fetchJson: SlackFetchJson;
  readonly token: string;
}

/**
 * Read the Slack bot token from the environment (the ONLY place the secret lives).
 * Order: the task-canonical `VANTA_SLACK_TOKEN`, then the conventional
 * `SLACK_BOT_TOKEN`, then the messaging-registry name `VANTA_SLACK_BOT_TOKEN`.
 * Whitespace-trimmed; an empty/absent value → `null` (caller skips the fetch).
 */
export function slackToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw =
    env["VANTA_SLACK_TOKEN"] ??
    env["SLACK_BOT_TOKEN"] ??
    env["VANTA_SLACK_BOT_TOKEN"];
  const token = raw?.trim();
  return token ? token : null;
}

/**
 * Fetch + parse the workspace's Slack channels (errors-as-values, NEVER throws).
 * Calls `conversations.list` with a `Bearer` token via the injected `fetchJson`,
 * then runs the body through the pure `parseChannelList`. A Slack-level failure
 * (`{ok:false,error}`) or a thrown fetch both yield `[]` (the reason is returned to
 * the optional logger). The composer can call this on every keystroke safely.
 */
export async function fetchSlackChannels(
  deps: SlackChannelDeps,
  log?: (reason: string) => void,
): Promise<SlackChannel[]> {
  try {
    const body = await deps.fetchJson(SLACK_CONVERSATIONS_LIST, {
      Authorization: `Bearer ${deps.token}`,
    });
    const apiError = slackApiError(body);
    if (apiError !== null) {
      log?.(`slack conversations.list failed: ${apiError}`);
      return [];
    }
    return parseChannelList(body);
  } catch (err) {
    log?.(`slack conversations.list threw: ${errorMessage(err)}`);
    return [];
  }
}

/**
 * The live `fetchJson`: a real `fetch` against Slack with the bearer header. Returns
 * the parsed JSON body (Slack always answers 200 with `{ok:…}`); a transport failure
 * or a non-JSON body rejects, which `fetchSlackChannels` catches → `[]`.
 */
export const realSlackFetch: SlackFetchJson = async (url, headers) => {
  const res = await fetch(url, { method: "GET", headers });
  return res.json();
};

/** Injectable wall-clock so the cache TTL is deterministic under test. */
export type Clock = () => number;

interface CacheEntry {
  fetchedAt: number;
  channels: SlackChannel[];
}

/** Module-level cache — one workspace per process; keyed by nothing but presence. */
let cache: CacheEntry | null = null;

/**
 * Cached channel list so the composer doesn't refetch on every keystroke. The first
 * call (or one past the TTL) fetches via `deps`; subsequent calls within `ttlMs`
 * reuse the snapshot. A fetch yielding `[]` is still cached (a failed/empty workspace
 * shouldn't hammer Slack every keystroke); call `clearChannelCache()` to force a
 * refetch. `now` is injectable for the test's fake clock.
 */
export async function getCachedChannels(
  deps: SlackChannelDeps,
  ttlMs: number = DEFAULT_CACHE_TTL_MS,
  now: Clock = Date.now,
): Promise<SlackChannel[]> {
  const t = now();
  if (cache !== null && t - cache.fetchedAt < ttlMs) return cache.channels;
  const channels = await fetchSlackChannels(deps);
  cache = { fetchedAt: t, channels };
  return channels;
}

/** Drop the cached snapshot so the next `getCachedChannels` refetches (test/reset). */
export function clearChannelCache(): void {
  cache = null;
}

/** Slack answers `{ok:false,error}` on failure — return that error, else `null`. */
function slackApiError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null; // parser handles shape
  const b = body as Record<string, unknown>;
  if (b["ok"] === false) {
    return typeof b["error"] === "string" ? b["error"] : "unknown slack error";
  }
  return null;
}

/** Best-effort message off an unknown thrown value (errors-as-values logging). */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
