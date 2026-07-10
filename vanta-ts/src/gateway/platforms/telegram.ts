import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  InboundMessage,
  OutboundDeliveryReceipt,
  OutboundMessage,
  PlatformAdapter,
  PlatformWebhookHandler,
} from "./base.js";
import { formatForDialect } from "./format.js";
import { capabilities, segmentsFor, type AdapterCapabilities } from "./capabilities.js";

// Telegram Bot API caps sendMessage text at 4096 UTF-16 code units. Declared as
// capabilities (MSG-CAPABILITY-DESCRIPTOR) so the send path reads them off the adapter.
const TELEGRAM_CAPABILITIES: AdapterCapabilities = capabilities({
  charLimit: 4096,
  lenUnit: "utf16",
  supportsThreads: true,
  markdownDialect: "telegram",
});

// Telegram Bot API adapter — long-poll getUpdates for inbound, sendMessage for
// outbound. Pure fetch, no SDK. Get a token from @BotFather and set
// VANTA_TELEGRAM_TOKEN. Offline-tested (parseUpdates is pure); live use needs the
// token. Optional VANTA_TELEGRAM_ALLOW = comma-list of chat ids to accept.

const TelegramUpdate = z.object({
      update_id: z.number(),
      // MSG-INLINE-APPROVAL — a tapped inline button arrives as callback_query;
      // its `data` becomes the inbound text (e.g. "yes ab12cd"), which the
      // approval reply bus consumes exactly like a typed reply.
      callback_query: z
        .object({
          id: z.string(),
          data: z.string().optional(),
          from: z.object({ username: z.string().optional(), first_name: z.string().optional() }).optional(),
          message: z.object({ chat: z.object({ id: z.number() }) }).optional(),
        })
        .optional(),
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
    });

const UpdatesResponse = z.object({
  ok: z.boolean(),
  result: z.array(TelegramUpdate),
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

export type ParsedUpdates = { messages: InboundMessage[]; nextOffset: number; callbackIds: string[] };

type RawCallback = NonNullable<z.infer<typeof UpdatesResponse>["result"][number]["callback_query"]>;
type RawMessage = z.infer<typeof UpdatesResponse>["result"][number]["message"];
type TelegramUpdateValue = z.infer<typeof TelegramUpdate>;

/** MSG-INLINE-APPROVAL — a tapped button becomes an inbound whose text is the callback data. */
function callbackInbound(cb: RawCallback): InboundMessage | null {
  if (!cb.data || !cb.message) return null;
  return {
    chatId: String(cb.message.chat.id),
    text: cb.data,
    from: cb.from?.username ?? cb.from?.first_name,
    id: `cb-${cb.id}`,
  };
}

/** A plain text update → inbound (thread routing per MSG-TELEGRAM-ROBUST). */
function messageInbound(m: RawMessage): InboundMessage | null {
  if (!m?.text) return null;
  const replyToId = m.reply_to_message?.message_id;
  return {
    chatId: String(m.chat.id),
    text: m.text,
    from: m.from?.username ?? m.from?.first_name,
    id: m.message_id !== undefined ? String(m.message_id) : undefined,
    isGroup: isGroupChat(m.chat.type),
    // Only a real forum-topic message routes replies to its topic —
    // message_thread_id also rides on plain replies, where it is NOT a topic.
    threadId: m.is_topic_message && m.message_thread_id !== undefined ? String(m.message_thread_id) : undefined,
    replyToId: replyToId !== undefined ? String(replyToId) : undefined,
  };
}

/**
 * Parse a getUpdates payload into inbound messages + the next offset (max
 * update_id + 1). Skips updates without a text message. Pure.
 */
export function parseUpdates(payload: unknown, currentOffset: number): ParsedUpdates {
  const parsed = UpdatesResponse.safeParse(payload);
  if (!parsed.success || !parsed.data.ok) return { messages: [], nextOffset: currentOffset, callbackIds: [] };

  const messages: InboundMessage[] = [];
  const callbackIds: string[] = [];
  let maxId = currentOffset - 1;
  for (const u of parsed.data.result) {
    maxId = Math.max(maxId, u.update_id);
    const cb = u.callback_query;
    if (cb) {
      callbackIds.push(cb.id);
      const tapped = callbackInbound(cb);
      if (tapped) messages.push(tapped);
      continue;
    }
    const inbound = messageInbound(u.message);
    if (inbound) messages.push(inbound);
  }
  return { messages, nextOffset: maxId + 1, callbackIds };
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

/** Constant-time comparison for Telegram's webhook secret header. */
export function matchesWebhookSecret(received: string | undefined, expected: string): boolean {
  if (received === undefined) return false;
  const actual = Buffer.from(received);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
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
  readonly capabilities = TELEGRAM_CAPABILITIES;
  private offset = 0;
  private readonly base: string;
  private readonly allow: Set<string>;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly webhookSecret?: string;
  private readonly pending: TelegramUpdateValue[] = [];

  constructor(opts: {
    token: string;
    allow?: Set<string>;
    apiBase?: string;
    sleep?: (ms: number) => Promise<void>;
    webhookSecret?: string;
  }) {
    this.base = `${opts.apiBase ?? "https://api.telegram.org"}/bot${opts.token}`;
    this.allow = opts.allow ?? new Set();
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.webhookSecret = opts.webhookSecret?.trim() || undefined;
  }

  async connect(): Promise<void> {
    /* stateless HTTP — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    const payload = this.webhookSecret
      ? { ok: true, result: this.pending.splice(0) }
      : await fetch(`${this.base}/getUpdates?timeout=0&offset=${this.offset}`).then((res) => res.json());
    const { messages, nextOffset, callbackIds } = parseUpdates(payload, this.offset);
    this.offset = nextOffset;
    // Ack every callback so Telegram stops the button spinner (best-effort).
    for (const id of callbackIds) {
      await fetch(`${this.base}/answerCallbackQuery`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callback_query_id: id }),
      }).catch(() => {});
    }
    return this.allow.size === 0 ? messages : messages.filter((m) => this.allow.has(m.chatId));
  }

  webhookHandlers(): PlatformWebhookHandler[] {
    if (!this.webhookSecret) return [];
    return [{
      path: "/telegram/webhook",
      receive: async ({ body, headers }) => {
        const rawHeader = headers["x-telegram-bot-api-secret-token"];
        const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
        if (!matchesWebhookSecret(header, this.webhookSecret!)) return { status: 401, body: "unauthorized" };
        let payload: unknown;
        try { payload = JSON.parse(body); }
        catch { return { status: 400, body: "invalid json" }; }
        const update = TelegramUpdate.safeParse(payload);
        if (!update.success) return { status: 400, body: "invalid update" };
        this.pending.push(update.data);
        return { status: 202, body: "accepted" };
      },
    }];
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
      // MSG-INLINE-APPROVAL — tappable buttons; the callback data round-trips
      // as the inbound text the approval relay already parses.
      ...(msg.buttons?.length
        ? { reply_markup: { inline_keyboard: [msg.buttons.map((b) => ({ text: b.label, callback_data: b.data }))] } }
        : {}),
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

  async send(msg: OutboundMessage): Promise<OutboundDeliveryReceipt | undefined> {
    // Escape the agent's markdown for Telegram's MarkdownV2 (code protected first)
    // BEFORE splitting, then send with parse_mode so bold/code render — not leak.
    const formatted = formatForDialect(msg.text, "telegram");
    let parts = 0;
    for (const part of segmentsFor(formatted, this.capabilities)) {
      const id = await this.sendPart(msg, part);
      if (id === undefined) return undefined;
      parts += 1;
      // Record the FIRST sent part's id as the message's reply-context key, so the
      // gateway's record-on-send (reply-store) can key the bot's reply. A split
      // message's head is the stable reply target.
      if (msg.id === undefined) msg.id = id;
    }
    return parts > 0
      ? { platform: "telegram", transport: "bot-api", accepted: true, parts }
      : undefined;
  }
}
