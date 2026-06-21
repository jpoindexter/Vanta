// VANTA-SLACK-CHANNEL-SUGGEST — `#channel` autocomplete for the composer. Sibling
// to ui/file-index.ts (@-mention ranking) and ui/shell-complete.ts (pure-classifier
// completion): same ranked-prefix-then-substring + cap shape, and the same
// trigger-char fragment extraction as term/at-context.ts's `activeAtRef` — but here
// the trigger is `#` and the corpus is the workspace's Slack channels.
//
// Wiring (NOT done this round, mirrors clarity-gate / file-index's header): the
// composer's `#`-completion — the same Tab/typed-fragment handler that today calls
// term/at-context.ts `activeAtRef(input)` + ui/file-index.ts `queryFileIndex` for
// `@file` — would instead call `activeChannelRef(input, cursor)` to extract the
// `#`-fragment under the cursor, and (when non-null) `suggestChannels(fragment,
// channels)` to rank matches, rendering each via `formatChannelSuggestion`. The
// `channels` list is the injected BOUNDARY: a cached snapshot from Slack's
// `conversations.list` (one call over a Slack bot/user token), parsed by
// `parseChannelList`. The live fetch (and the token it needs) lives at the wire, NOT
// here — exactly as file-index injects `walk` and shell-complete injects its sources,
// so this module is unit-tested without a token or a network.
//
// SECURITY: a Slack token is a SECRET. It is used ONLY by the injected fetch named at
// the wire above — there is no token literal in this module (gitleaks-safe; no
// `const token = ...`). Channel names are EXTERNAL input: `formatChannelSuggestion`
// strips control characters before display so a crafted channel name can't inject an
// escape sequence into the terminal (Ink escapes its own props, but a raw render of
// the returned string stays safe).

/** Default cap on returned suggestions — a completion list stays readable. */
export const DEFAULT_CHANNEL_MAX = 10;

/**
 * One Slack channel, the minimal shape the suggester needs (PURE/injectable).
 * `isMember`/`isArchived` are optional so a partial parse still ranks; absent
 * `isMember` ranks as non-member, absent `isArchived` ranks as not-archived.
 */
export interface SlackChannel {
  /** Slack channel id (e.g. `C0123ABC`). Used for dedupe + the eventual reference. */
  readonly id: string;
  /** Channel name WITHOUT the leading `#` (Slack returns it bare, e.g. `general`). */
  readonly name: string;
  /** Whether the operator's token is a member — members rank above non-members. */
  readonly isMember?: boolean;
  /** Whether the channel is archived — archived channels are dropped from results. */
  readonly isArchived?: boolean;
}

/**
 * Extract the `#`-fragment being typed at the cursor (PURE). Mirrors
 * term/at-context.ts `activeAtRef`, but for `#`: returns the text after the LAST `#`
 * up to the cursor when the cursor sits inside a `#`-token, else null.
 * - Not in a `#`-token (no `#`, or a space separates the last `#` from the cursor) → null.
 * - A bare `#` at the cursor → `""` (the empty fragment → recent/first members).
 * - The fragment is only the text up to the cursor, so a mid-token cursor completes
 *   only what precedes it (`#gen|eral` → `gen`).
 * A channel fragment is Slack-name-shaped: letters/digits/`-`/`_` (no spaces).
 */
export function activeChannelRef(input: string, cursor: number): string | null {
  const pos = clampCursor(input, cursor);
  const before = input.slice(0, pos);
  const m = before.match(/#([\w-]*)$/);
  return m ? m[1]! : null;
}

/**
 * Rank channels for a fragment (PURE). Name prefix-match beats substring-match
 * (case-insensitive); within a tier a member channel ranks above a non-member;
 * archived channels are dropped; results are deduped by id and capped at `max`
 * (default 10). An empty/whitespace fragment returns the first `max` MEMBER channels
 * (recent/first N — the list's order). No match → `[]`.
 */
export function suggestChannels(
  fragment: string,
  channels: readonly SlackChannel[],
  max: number = DEFAULT_CHANNEL_MAX,
): SlackChannel[] {
  const active = dedupeById(channels).filter((c) => c.isArchived !== true);
  const needle = fragment.trim().toLowerCase();

  if (needle === "") {
    return active.filter((c) => c.isMember === true).slice(0, max);
  }

  const ranked: { ch: SlackChannel; rank: number }[] = [];
  for (const ch of active) {
    const rank = rankOf(ch, needle);
    if (rank !== RANK_NONE) ranked.push({ ch, rank });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.ch.name.length - b.ch.name.length ||
      a.ch.name.localeCompare(b.ch.name),
  );
  return ranked.slice(0, max).map((r) => r.ch);
}

/** Display form for a suggestion: `#<name>`, control-stripped (PURE). */
export function formatChannelSuggestion(ch: SlackChannel): string {
  return `#${stripControl(ch.name)}`;
}

/**
 * Tolerant parse of a Slack `conversations.list` JSON body (PURE). Accepts the raw
 * string or an already-parsed object; reads `{channels:[{id,name,is_member,
 * is_archived}]}`. Rows missing a string `id` or `name` are skipped. Any malformed
 * input (bad JSON, wrong shape, non-array `channels`) → `[]` — errors-as-values, never
 * throws across the boundary.
 */
export function parseChannelList(json: unknown): SlackChannel[] {
  const root = coerceObject(json);
  if (root === null) return [];
  const rows = root["channels"];
  if (!Array.isArray(rows)) return [];

  const out: SlackChannel[] = [];
  for (const row of rows) {
    const ch = coerceChannel(row);
    if (ch !== null) out.push(ch);
  }
  return out;
}

/** Rank tier bases — lower sorts first; a name-prefix hit beats a substring hit. */
const RANK_PREFIX = 0;
const RANK_SUBSTRING = 1;
/** Sentinel returned by `rankOf` for a non-matching channel (filtered out). */
const RANK_NONE = -1;
/** Member channels rank ahead of non-members WITHIN a name-match tier. */
const NON_MEMBER_PENALTY = 1;
/** Tier width so a member-bump never crosses into the next match tier. */
const TIER_WIDTH = 2;

/** The best match tier for one channel against an already-lowercased needle. */
function rankOf(ch: SlackChannel, needle: string): number {
  const name = ch.name.toLowerCase();
  const memberBump = ch.isMember === true ? 0 : NON_MEMBER_PENALTY;
  if (name.startsWith(needle)) return RANK_PREFIX * TIER_WIDTH + memberBump;
  if (name.includes(needle)) return RANK_SUBSTRING * TIER_WIDTH + memberBump;
  return RANK_NONE;
}

/** Drop later channels sharing an earlier channel's id (first occurrence wins). */
function dedupeById(channels: readonly SlackChannel[]): SlackChannel[] {
  const seen = new Set<string>();
  const out: SlackChannel[] = [];
  for (const ch of channels) {
    if (seen.has(ch.id)) continue;
    seen.add(ch.id);
    out.push(ch);
  }
  return out;
}

/** Strip C0 control characters + DEL so an external name can't emit terminal escapes. */
function stripControl(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\x00-\x1f\x7f]/g, "");
}

/** Clamp a cursor index into `[0, input.length]` so callers can't over/underflow. */
function clampCursor(input: string, cursor: number): number {
  if (cursor < 0) return 0;
  if (cursor > input.length) return input.length;
  return cursor;
}

/** Narrow `unknown` to a plain record, parsing a JSON string first. `null` on failure. */
function coerceObject(json: unknown): Record<string, unknown> | null {
  let value = json;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Narrow one `conversations.list` row to a `SlackChannel`. `null` if id/name absent. */
function coerceChannel(row: unknown): SlackChannel | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r["id"] !== "string" || typeof r["name"] !== "string") return null;
  return {
    id: r["id"],
    name: r["name"],
    isMember: r["is_member"] === true,
    isArchived: r["is_archived"] === true,
  };
}
