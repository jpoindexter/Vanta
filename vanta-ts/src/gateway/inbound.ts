import type { InboundMessage } from "./platforms/base.js";
import { lookupSent, type ReplyStoreDeps } from "./reply-store.js";

// The inbound gateway pipeline: four PURE steps, each independently testable,
// composed by `processInbound`. Order: dedup → require-mention(+strip) →
// timestamp → reply-context-enrich. Any step may return a "skip" verdict; the
// gateway loop drops a skipped message without spawning an agent turn. DM /
// non-reply / non-duplicate messages flow through unchanged (verdict "handle").

export type InboundVerdict =
  | { kind: "skip"; reason: SkipReason }
  | { kind: "handle"; message: InboundMessage };

export type SkipReason = "self-echo" | "duplicate" | "no-mention";

// --- MSG-SELF-ECHO-DEDUP -----------------------------------------------------

/** Bounded set of seen message ids, oldest-evicted, for replay/reconnect dedup. */
export type SeenIds = { ids: Set<string>; order: string[]; cap: number };

export function newSeenIds(cap = 500): SeenIds {
  return { ids: new Set(), order: [], cap: Math.max(1, cap) };
}

/**
 * Pure: decide whether a message is a self-echo or a replayed duplicate, and
 * return the (possibly mutated) seen-set. `fromMe` marks the bot's own outbound
 * echoed back; an id already in the bounded set marks a reconnect/replay dupe.
 * A new id is recorded (with cap eviction). Messages without an id are never
 * treated as duplicates (can't be tracked) but are still echo-checked.
 */
export function dedup(
  msg: InboundMessage,
  seen: SeenIds,
): { drop: false; seen: SeenIds } | { drop: true; reason: SkipReason; seen: SeenIds } {
  if (msg.fromMe === true) return { drop: true, reason: "self-echo", seen };
  const id = msg.id;
  if (!id) return { drop: false, seen };
  if (seen.ids.has(id)) return { drop: true, reason: "duplicate", seen };
  const order = [...seen.order, id];
  const ids = new Set(seen.ids).add(id);
  while (order.length > seen.cap) {
    const oldest = order.shift();
    if (oldest !== undefined) ids.delete(oldest);
  }
  return { drop: false, seen: { ids, order, cap: seen.cap } };
}

// --- MSG-REQUIRE-MENTION -----------------------------------------------------

export type MentionConfig = {
  /** The bot's @-handle (without the leading @), e.g. "vantabot". */
  handle: string;
  /** Group chats requiring an explicit mention. Empty/absent → all groups require it. */
  requireMentionIn?: Set<string>;
};

function startsWithCommand(text: string): boolean {
  return text.trimStart().startsWith("/");
}

function mentionRegex(handle: string): RegExp {
  const safe = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${safe}\\b`, "i");
}

/** Pure: strip every `@handle` mention from the text and tidy whitespace. */
export function stripMention(text: string, handle: string): string {
  if (!handle) return text;
  return text.replace(mentionRegex(handle), "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Pure: in a GROUP context, respond only when @-mentioned, replied-to (a reply
 * targeting the bot's own prior message), or the text starts with `/`. When it
 * passes, the `@handle` mention is stripped from the text. DM / 1:1 always
 * passes unchanged. `repliesToBot` is supplied by the reply-context lookup.
 */
export function requireMention(
  msg: InboundMessage,
  cfg: MentionConfig,
  repliesToBot: boolean,
): { respond: false } | { respond: true; message: InboundMessage } {
  if (msg.isGroup !== true) return { respond: true, message: msg };
  const gated = !cfg.requireMentionIn || cfg.requireMentionIn.size === 0 || cfg.requireMentionIn.has(msg.chatId);
  if (!gated) return { respond: true, message: msg };
  const mentioned = !!cfg.handle && mentionRegex(cfg.handle).test(msg.text);
  if (!mentioned && !repliesToBot && !startsWithCommand(msg.text)) return { respond: false };
  return { respond: true, message: { ...msg, text: stripMention(msg.text, cfg.handle) } };
}

// --- MSG-INBOUND-TIMESTAMP ---------------------------------------------------

const TS_PREFIX = /^\[[A-Z][a-z]{2} \d{4}-\d{2}-\d{2} \d{2}:\d{2}(?: [A-Za-z0-9+:-]+)?\]\s*/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Pure: strip any leading `[Tue 2026-04-28 13:40 CEST]`-style prefix. Idempotent. */
export function stripTimestampPrefix(text: string): string {
  return text.replace(TS_PREFIX, "");
}

/** Pure: format a human timestamp like `Tue 2026-04-28 13:40 CEST` from parts. */
export function formatTimestamp(parts: { weekday: string; date: string; time: string; zone?: string }): string {
  const tail = parts.zone ? ` ${parts.zone}` : "";
  return `${parts.weekday} ${parts.date} ${parts.time}${tail}`;
}

/**
 * Pure: prefix the text with one human timestamp for LLM context. Strips any
 * existing such prefix FIRST, so re-processing never stacks `[ts][ts]`. The
 * stamp is derived from `now` (defaults to current time); zone label optional.
 */
export function withTimestamp(text: string, now: Date, zone?: string): string {
  const clean = stripTimestampPrefix(text);
  const weekday = WEEKDAYS[now.getDay()] ?? "Sun";
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const stamp = formatTimestamp({ weekday, date, time, zone });
  return `[${stamp}] ${clean}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// --- MSG-REPLY-CONTEXT (enrich) ----------------------------------------------

/** Inject quoted bot text as a leading block. Pure given the resolved quote. */
export function injectQuote(text: string, quoted: string): string {
  return `[in reply to: ${quoted}]\n${text}`;
}

// --- Composition -------------------------------------------------------------

export type InboundContext = {
  seen: SeenIds;
  mention: MentionConfig;
  now: () => Date;
  zone?: string;
  /** Reply-context store deps; absent → reply lookup degrades to no-op. */
  reply?: ReplyStoreDeps;
};

export type ProcessResult = { verdict: InboundVerdict; seen: SeenIds };

/**
 * Compose the pipeline for one inbound message. Returns the next seen-set plus a
 * verdict: "skip" (no agent turn) or "handle" (the message to run). The reply-
 * context lookup is the one async step (store read); everything else is pure. A
 * store miss degrades to no quote + `repliesToBot=false`.
 *
 * On "handle", `message.text` stays the CLEAN content (mention stripped) so the
 * gateway routes/queues/persists on the original leading marker; the timestamp +
 * quote enrichment goes into `message.llmText` — the LLM-facing text only.
 */
export async function processInbound(msg: InboundMessage, ctx: InboundContext): Promise<ProcessResult> {
  const d = dedup(msg, ctx.seen);
  if (d.drop) return { verdict: { kind: "skip", reason: d.reason }, seen: d.seen };
  const seen = d.seen;

  const quoted = msg.replyToId && ctx.reply ? await lookupSent(ctx.reply, msg.replyToId) : null;

  const gate = requireMention(msg, ctx.mention, quoted !== null);
  if (!gate.respond) return { verdict: { kind: "skip", reason: "no-mention" }, seen };

  let llmText = withTimestamp(gate.message.text, ctx.now(), ctx.zone);
  if (quoted !== null) llmText = injectQuote(llmText, quoted);

  return { verdict: { kind: "handle", message: { ...gate.message, llmText } }, seen };
}
