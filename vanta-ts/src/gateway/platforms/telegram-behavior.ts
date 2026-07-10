import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { InboundMessage, PlatformWebhookHandler } from "./base.js";

// Shared Telegram platform behavior. Both receive transports (getUpdates polling
// and authenticated webhook push) feed this layer, so parsing, callback mapping,
// and allowlist gating cannot drift when the transport changes.

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

export type ParsedUpdates = { messages: InboundMessage[]; nextOffset: number; callbackIds: string[] };

type RawCallback = NonNullable<z.infer<typeof UpdatesResponse>["result"][number]["callback_query"]>;
type RawMessage = z.infer<typeof UpdatesResponse>["result"][number]["message"];
export type TelegramUpdateValue = z.infer<typeof TelegramUpdate>;

// Telegram's getUpdates does not echo the bot's own messages back, so a long-poll
// inbound is never `fromMe`; we leave it undefined rather than spend a network
// call on getMe to self-detect. Self-echo dedup relies on the outbound id store.
const GROUP_CHAT_TYPES = new Set(["group", "supergroup"]);

/** Group flag from chat.type — undefined when type is absent (don't guess). */
function isGroupChat(type: string | undefined): boolean | undefined {
  if (type === undefined) return undefined;
  return GROUP_CHAT_TYPES.has(type);
}

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

/** A plain text update -> inbound (thread routing per MSG-TELEGRAM-ROBUST). */
function messageInbound(m: RawMessage): InboundMessage | null {
  if (!m?.text) return null;
  const replyToId = m.reply_to_message?.message_id;
  return {
    chatId: String(m.chat.id),
    text: m.text,
    from: m.from?.username ?? m.from?.first_name,
    id: m.message_id !== undefined ? String(m.message_id) : undefined,
    isGroup: isGroupChat(m.chat.type),
    // Only a real forum-topic message routes replies to its topic -
    // message_thread_id also rides on plain replies, where it is NOT a topic.
    threadId: m.is_topic_message && m.message_thread_id !== undefined ? String(m.message_thread_id) : undefined,
    replyToId: replyToId !== undefined ? String(replyToId) : undefined,
  };
}

/**
 * Parse a getUpdates-compatible payload into inbound messages + the next offset
 * (max update_id + 1). Skips updates without text. Pure.
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

/** Constant-time comparison for Telegram's webhook secret header. */
export function matchesWebhookSecret(received: string | undefined, expected: string): boolean {
  if (received === undefined) return false;
  const actual = Buffer.from(received);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export class TelegramReceiveBehavior {
  private readonly allow: Set<string>;
  private readonly webhookSecret?: string;
  private readonly pending: TelegramUpdateValue[] = [];

  constructor(opts: { allow?: Set<string>; webhookSecret?: string }) {
    this.allow = opts.allow ?? new Set();
    this.webhookSecret = opts.webhookSecret?.trim() || undefined;
  }

  get receivesWebhook(): boolean {
    return this.webhookSecret !== undefined;
  }

  parseAndFilter(payload: unknown, currentOffset: number): ParsedUpdates {
    const parsed = parseUpdates(payload, currentOffset);
    return {
      ...parsed,
      messages: this.allow.size === 0
        ? parsed.messages
        : parsed.messages.filter((m) => this.allow.has(m.chatId)),
    };
  }

  drainWebhookPayload(): { ok: true; result: TelegramUpdateValue[] } {
    return { ok: true, result: this.pending.splice(0) };
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
}
