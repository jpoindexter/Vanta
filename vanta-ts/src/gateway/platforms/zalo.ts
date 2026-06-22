import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Zalo adapter — connects Vanta to the Zalo Official Account (OA) API as a messaging
// channel, implementing the same PlatformAdapter contract as LINE/Telegram/Discord so the
// gateway treats it like any other channel. The live Zalo OA API (a webhook event source for
// inbound + a /v3.0/oa/message/cs POST for outbound) is the injected boundary: the pure
// parse/build/allowlist fns are unit-tested offline; the transport ({poll, send}) is supplied
// by the caller (a real Zalo OA channel live).
//
// Inbound shape (a Zalo OA webhook event, e.g. a user text message):
//   {app_id, sender:{id}, recipient:{id}, event_name:"user_send_text", message:{text, msg_id},
//    timestamp}. parse → InboundMessage[]. sender.id IS the conversation key (chatId) — a 1:1 OA
//    chat — so a reply sends back to the same user. sender.id → `from` (also the allowlist key);
//    message.text → text; message.msg_id → id. Only a `user_send_text` event carries routable
//    agent text — non-text events (user_send_image, sticker, follow, oa_send_text, etc.) are SKIPPED.
// Outbound: buildZaloSend(userId, text) → {recipient:{user_id}, message:{text}}; the adapter
//   POSTs it via the injected transport, keyed by chatId (the user id). The send api is keyed by
//   the recipient user id (the same id the inbound sender carried).
// Enable: VANTA_ZALO_TOKEN present (the OA access token). Optional VANTA_ZALO_ALLOWLIST = comma
//   list of user ids to accept (empty → allow all). The token is a SECRET: it is only ever read
//   into the injected transport at the wire (httpTransport), never a literal in this file.
// Anti-loop: a Zalo OA webhook delivers user→OA events on the inbound topic; the bot's own
//   outbound is an oa_send_* event (a different event_name) and is dropped at the parse, so
//   there is no self-message to skip here.

// Strip C0/C1 control chars (incl. ESC, DEL) from untrusted inbound text, but KEEP
// newline (\x0a) and tab (\x09) — both legitimate in a chat message and the agent input is
// multi-line. Defends against escape/control injection from a remote sender before the text
// reaches the agent.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

// The only inbound event that carries a routable agent text message. A user_send_image /
// user_send_sticker / follow / oa_send_* event carries no agent-facing text and is skipped.
const TEXT_EVENT = "user_send_text";

// One Zalo OA webhook event as it arrives from the channel webhook. Tolerant: only the fields
// we route on are required; unknown extras (app_id, recipient, timestamp, …) are ignored by
// zod's default object parse. A non-text event (no event_name match), or a missing
// sender.id/message.text, is dropped by the caller.
const ZaloEvent = z.object({
  event_name: z.string(),
  sender: z.object({ id: z.string() }),
  message: z.object({ text: z.string().optional(), msg_id: z.string().optional() }).optional(),
});

/** Unwrap a Zalo OA webhook payload to its event array: a single event object OR a bare array
 * of events. Pure. */
function eventsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") return [json]; // Zalo delivers one event per webhook POST
  return [];
}

/**
 * Parse a Zalo OA webhook payload into inbound messages. Accepts a single event object (Zalo
 * delivers one event per webhook POST) AND a bare array. Keeps only a `user_send_text` event —
 * non-text events (user_send_image, sticker, follow, oa_send_text, etc.) are SKIPPED. Tolerant: a
 * non-object, or any element that fails the shape, is dropped (garbage → []). Inbound text is
 * control-stripped. Pure.
 *
 * Zalo's {sender.id, message.text, message.msg_id} map onto the shared `InboundMessage`
 * contract (`gateway/platforms/base.ts`, off-limits this round): sender.id → chatId (the 1:1 OA
 * conversation/routing key the send api uses) AND `from` (the sender, also the allowlist key),
 * message.text → text, message.msg_id → id. A Zalo OA chat is always 1:1 (no group), so isGroup
 * stays false.
 */
export function parseZaloEvents(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of eventsOf(json)) {
    const parsed = ZaloEvent.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.event_name !== TEXT_EVENT) continue; // only a text event carries routable agent text
    if (e.message?.text === undefined) continue; // text only
    messages.push({
      chatId: e.sender.id,
      from: e.sender.id,
      text: stripControl(e.message.text),
      id: e.message.msg_id,
      isGroup: false,
    });
  }
  return messages;
}

// Zalo OA caps a text message at 2000 characters; a longer reply is split by the caller before
// reaching here, so this slice is the per-message hard cap (a defensive backstop).
const ZALO_TEXT_LIMIT = 2000;

/**
 * Build the send body for POST /v3.0/oa/message/cs: {recipient:{user_id}, message:{text}}.
 * `user_id` is the chatId (the sender id from the inbound event). The text is control-stripped
 * and capped at Zalo's 2000-char limit (the caller splits a long reply first; this is the
 * per-message hard cap). Pure.
 */
export function buildZaloSend(
  userId: string,
  text: string,
): { recipient: { user_id: string }; message: { text: string } } {
  return {
    recipient: { user_id: userId },
    message: { text: stripControl(text).slice(0, ZALO_TEXT_LIMIT) },
  };
}

/**
 * Parse the VANTA_ZALO_ALLOWLIST user-id allowlist (comma list). Empty/absent → an empty set,
 * which the adapter treats as "allow all". Pure.
 */
export function parseZaloAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_ZALO_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Zalo OA is enabled when the OA access token is configured (VANTA_ZALO_TOKEN). Not configured =
 * disabled. Pure.
 */
export function zaloEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_ZALO_TOKEN && env.VANTA_ZALO_TOKEN.trim());
}

/**
 * The injected Zalo OA transport — the documented live boundary. `poll` pulls new webhook events
 * (the webhook event source); `send` POSTs one send body to the Zalo OA API. Both carry the OA
 * access token internally (see `httpTransport` below, the ONLY place the secret is read). Tests
 * pass a fake transport so no real network — and no secret — is touched.
 */
export type ZaloTransport = {
  poll: () => Promise<unknown>;
  send: (body: unknown) => Promise<void>;
};

export class ZaloAdapter implements PlatformAdapter {
  readonly id = "zalo";
  private readonly transport: ZaloTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: ZaloTransport; allow?: Set<string> }) {
    this.transport = opts.transport;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    /* stateless REST via the injected transport — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    const json = await this.transport.poll().catch(() => undefined);
    const messages = parseZaloEvents(json);
    if (this.allow.size === 0) return messages;
    // Allow a message whose conversation (chatId) OR sender (from) is listed — both are the
    // user id for a 1:1 OA chat.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Zalo OA renders plain text (no markdown), so degrade the agent's markdown to readable
    // plain text, then split to the budget and POST each part keyed by chatId (the user id).
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, ZALO_TEXT_LIMIT, "chars")) {
      await this.transport.send(buildZaloSend(msg.chatId, part)).catch(() => {
        /* errors-as-values: a send failure must not throw through the gateway loop */
      });
    }
  }
}

// Zalo OA Open API base — the injected transport joins this with the per-call path.
const ZALO_API_BASE = "https://openapi.zalo.me";

/**
 * Build the live Zalo OA REST transport. THE WIRE: the OA access token (a secret) is read ONLY
 * here, into the `access_token` header — never stored on the adapter and never a literal in this
 * file. `poll`/`send` are errors-tolerant at the call site (poll catches; the gateway loop never
 * throws). Zalo OA has no inbound poll endpoint (events arrive via the channel webhook), so
 * `poll` is supplied by the caller's webhook buffer in live use; the default here returns no
 * events. Live use needs a real OA access token (1-hour validity — the caller refreshes it).
 */
export function httpTransport(token: string, apiBase?: string): ZaloTransport {
  const base = (apiBase ?? ZALO_API_BASE).replace(/\/+$/, "");
  const headers = { access_token: token, "content-type": "application/json" };
  return {
    poll: async () => undefined, // inbound arrives via the channel webhook, not a poll endpoint
    send: async (body) => {
      await fetch(`${base}/v3.0/oa/message/cs`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
