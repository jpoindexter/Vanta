import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Telegram Bot API caps sendMessage text at 4096 UTF-16 code units.
const TELEGRAM_LIMIT = 4096;

// Telegram Bot API adapter — long-poll getUpdates for inbound, sendMessage for
// outbound. Pure fetch, no SDK. Get a token from @BotFather and set
// VANTA_TELEGRAM_TOKEN. Offline-tested (parseUpdates is pure); live use needs the
// token. Optional VANTA_TELEGRAM_ALLOW = comma-list of chat ids to accept.

const UpdatesResponse = z.object({
  ok: z.boolean(),
  result: z.array(
    z.object({
      update_id: z.number(),
      message: z
        .object({
          message_id: z.number().optional(),
          text: z.string().optional(),
          chat: z.object({ id: z.number(), type: z.string().optional() }),
          message_thread_id: z.number().optional(),
          is_topic_message: z.boolean().optional(),
          from: z.object({ username: z.string().optional(), first_name: z.string().optional() }).optional(),
          reply_to_message: z.object({ message_id: z.number().optional() }).optional(),
        })
        .optional(),
    }),
  ),
});

// Telegram's getUpdates does not echo the bot's own messages back, so a long-poll
// inbound is never `fromMe`; we leave it undefined rather than spend a network
// call on getMe to self-detect. Self-echo dedup relies on the outbound id store.
const GROUP_CHAT_TYPES = new Set(["group", "supergroup"]);

/** Group flag from chat.type — undefined when type is absent (don't guess). */
function isGroupChat(type: string | undefined): boolean | undefined {
  if (type === undefined) return undefined;
  return GROUP_CHAT_TYPES.has(type);
}

// sendMessage's response surfaces the assigned message id at result.message_id.
const SendResponse = z.object({
  ok: z.boolean(),
  result: z.object({ message_id: z.number() }).optional(),
});

export type ParsedUpdates = { messages: InboundMessage[]; nextOffset: number };

/**
 * Parse a getUpdates payload into inbound messages + the next offset (max
 * update_id + 1). Skips updates without a text message. Pure.
 */
export function parseUpdates(payload: unknown, currentOffset: number): ParsedUpdates {
  const parsed = UpdatesResponse.safeParse(payload);
  if (!parsed.success || !parsed.data.ok) return { messages: [], nextOffset: currentOffset };

  const messages: InboundMessage[] = [];
  let maxId = currentOffset - 1;
  for (const u of parsed.data.result) {
    maxId = Math.max(maxId, u.update_id);
    const m = u.message;
    if (!m?.text) continue;
    const replyToId = m.reply_to_message?.message_id;
    messages.push({
      chatId: String(m.chat.id),
      text: m.text,
      from: m.from?.username ?? m.from?.first_name,
      id: m.message_id !== undefined ? String(m.message_id) : undefined,
      isGroup: isGroupChat(m.chat.type),
      // MSG-TELEGRAM-ROBUST: only a real forum-topic message routes replies to
      // its topic — message_thread_id also rides on plain replies, where it is
      // NOT a topic and must not be echoed back.
      threadId: m.is_topic_message && m.message_thread_id !== undefined ? String(m.message_thread_id) : undefined,
      replyToId: replyToId !== undefined ? String(replyToId) : undefined,
    });
  }
  return { messages, nextOffset: maxId + 1 };
}

/** Parse the VANTA_TELEGRAM_ALLOW chat-id allowlist (empty = allow all). Pure. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * Pure: extract the assigned message id (stringified) from a sendMessage response
 * payload, or undefined when the response is malformed/not-ok. Used to key the
 * outbound message for reply-context lookup.
 */
export function parseSentId(payload: unknown): string | undefined {
  const parsed = SendResponse.safeParse(payload);
  if (!parsed.success || !parsed.data.ok || !parsed.data.result) return undefined;
  return String(parsed.data.result.message_id);
}

// Telegram flood control: {ok:false, error_code:429, parameters:{retry_after:N}}.
const RetryResponse = z.object({
  ok: z.literal(false),
  error_code: z.number(),
  parameters: z.object({ retry_after: z.number() }).optional(),
});

const MAX_SEND_ATTEMPTS = 3;
const MAX_RETRY_AFTER_SEC = 30;

/** Seconds to wait per Telegram's 429 flood-control response, or undefined. Pure. */
export function parseRetryAfter(payload: unknown): number | undefined {
  const parsed = RetryResponse.safeParse(payload);
  if (!parsed.success || parsed.data.error_code !== 429) return undefined;
  return Math.min(parsed.data.parameters?.retry_after ?? 1, MAX_RETRY_AFTER_SEC);
}

/** Read a response body as JSON, returning undefined instead of throwing. */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export class TelegramAdapter implements PlatformAdapter {
  readonly id = "telegram";
  private offset = 0;
  private readonly base: string;
  private readonly allow: Set<string>;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: { token: string; allow?: Set<string>; apiBase?: string; sleep?: (ms: number) => Promise<void> }) {
    this.base = `${opts.apiBase ?? "https://api.telegram.org"}/bot${opts.token}`;
    this.allow = opts.allow ?? new Set();
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async connect(): Promise<void> {
    /* stateless HTTP — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    const res = await fetch(`${this.base}/getUpdates?timeout=0&offset=${this.offset}`);
    const { messages, nextOffset } = parseUpdates(await res.json(), this.offset);
    this.offset = nextOffset;
    return this.allow.size === 0 ? messages : messages.filter((m) => this.allow.has(m.chatId));
  }

  /** POST one part, retrying on 429 flood control per Telegram's retry_after
   * (bounded attempts) instead of dropping the send. Returns the sent id. */
  private async sendPart(msg: OutboundMessage, part: string): Promise<string | undefined> {
    const body = JSON.stringify({
      chat_id: msg.chatId,
      text: part,
      parse_mode: "MarkdownV2",
      // MSG-TELEGRAM-ROBUST: replies to a forum topic route back to it; link
      // previews are suppressed (agent replies are often link-dense).
      ...(msg.threadId !== undefined ? { message_thread_id: Number(msg.threadId) } : {}),
      link_preview_options: { is_disabled: true },
    });
    for (let attempt = 1; ; attempt += 1) {
      const res = await fetch(`${this.base}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const payload = await safeJson(res);
      const retryAfterSec = parseRetryAfter(payload);
      if (retryAfterSec === undefined || attempt >= MAX_SEND_ATTEMPTS) return parseSentId(payload);
      await this.sleep(retryAfterSec * 1000);
    }
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Escape the agent's markdown for Telegram's MarkdownV2 (code protected first)
    // BEFORE splitting, then send with parse_mode so bold/code render — not leak.
    const formatted = formatForDialect(msg.text, "telegram");
    for (const part of splitForLimit(formatted, TELEGRAM_LIMIT, "utf16")) {
      const id = await this.sendPart(msg, part);
      // Record the FIRST sent part's id as the message's reply-context key, so the
      // gateway's record-on-send (reply-store) can key the bot's reply. A split
      // message's head is the stable reply target.
      if (msg.id === undefined) msg.id = id;
    }
  }
}
