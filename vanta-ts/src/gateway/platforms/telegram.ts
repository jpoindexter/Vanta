import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";

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
          text: z.string().optional(),
          chat: z.object({ id: z.number() }),
          from: z.object({ username: z.string().optional(), first_name: z.string().optional() }).optional(),
        })
        .optional(),
    }),
  ),
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
    messages.push({
      chatId: String(m.chat.id),
      text: m.text,
      from: m.from?.username ?? m.from?.first_name,
    });
  }
  return { messages, nextOffset: maxId + 1 };
}

/** Parse the VANTA_TELEGRAM_ALLOW chat-id allowlist (empty = allow all). Pure. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export class TelegramAdapter implements PlatformAdapter {
  readonly id = "telegram";
  private offset = 0;
  private readonly base: string;
  private readonly allow: Set<string>;

  constructor(opts: { token: string; allow?: Set<string>; apiBase?: string }) {
    this.base = `${opts.apiBase ?? "https://api.telegram.org"}/bot${opts.token}`;
    this.allow = opts.allow ?? new Set();
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

  async send(msg: OutboundMessage): Promise<void> {
    await fetch(`${this.base}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: msg.chatId, text: msg.text }),
    });
  }
}
