import { z } from "zod";
import type {
  InboundMessage,
  OutboundDeliveryReceipt,
  OutboundMessage,
  OutboundFile,
  OutboundFileDeliveryReceipt,
  PlatformAdapter,
  PlatformWebhookHandler,
} from "./base.js";
import { formatForDialect } from "./format.js";
import { capabilities, segmentsFor, type AdapterCapabilities } from "./capabilities.js";
import {
  TelegramReceiveBehavior,
  matchesWebhookSecret,
  parseAllowlist,
  parseUpdates,
  type ParsedUpdates,
} from "./telegram-behavior.js";

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

// sendMessage's response surfaces the assigned message id at result.message_id.
const SendResponse = z.object({
  ok: z.boolean(),
  result: z.object({ message_id: z.number() }).optional(),
});

export { TelegramReceiveBehavior, matchesWebhookSecret, parseAllowlist, parseUpdates };
export type { ParsedUpdates };

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
  readonly capabilities = TELEGRAM_CAPABILITIES;
  private offset = 0;
  private readonly base: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly receive: TelegramReceiveBehavior;

  constructor(opts: {
    token: string;
    allow?: Set<string>;
    apiBase?: string;
    sleep?: (ms: number) => Promise<void>;
    webhookSecret?: string;
  }) {
    this.base = `${opts.apiBase ?? "https://api.telegram.org"}/bot${opts.token}`;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.receive = new TelegramReceiveBehavior({ allow: opts.allow, webhookSecret: opts.webhookSecret });
  }

  async connect(): Promise<void> {
    /* stateless HTTP — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    const payload = this.receive.receivesWebhook
      ? this.receive.drainWebhookPayload()
      : await fetch(`${this.base}/getUpdates?timeout=0&offset=${this.offset}`).then((res) => res.json());
    const { messages, nextOffset, callbackIds } = this.receive.parseAndFilter(payload, this.offset);
    this.offset = nextOffset;
    // Ack every callback so Telegram stops the button spinner (best-effort).
    for (const id of callbackIds) {
      await fetch(`${this.base}/answerCallbackQuery`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callback_query_id: id }),
      }).catch(() => {});
    }
    return messages;
  }

  webhookHandlers(): PlatformWebhookHandler[] {
    return this.receive.webhookHandlers();
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

  /** Tell Telegram that the agent is working before its final reply is ready. */
  async sendTyping(target: { chatId: string; threadId?: string }): Promise<void> {
    await fetch(`${this.base}/sendChatAction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: target.chatId,
        action: "typing",
        ...(target.threadId !== undefined ? { message_thread_id: Number(target.threadId) } : {}),
      }),
    });
  }

  async sendFile(file: OutboundFile): Promise<OutboundFileDeliveryReceipt | undefined> {
    const body = new FormData();
    body.set("chat_id", file.chatId);
    if (file.threadId !== undefined) body.set("message_thread_id", file.threadId);
    body.set("document", new Blob([file.data], { type: file.mime }), file.name);
    const response = await fetch(`${this.base}/sendDocument`, { method: "POST", body });
    const id = parseSentId(await safeJson(response));
    return id ? {
      platform: "telegram", transport: "bot-api:sendDocument", accepted: true,
      name: file.name, mime: file.mime, bytes: file.data.byteLength,
    } : undefined;
  }
}
