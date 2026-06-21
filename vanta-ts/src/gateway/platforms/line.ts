import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// LINE adapter — connects Vanta to the LINE Messaging API as a messaging channel,
// implementing the same PlatformAdapter contract as Telegram/Discord/Matrix/Google Chat
// so the gateway treats it like any other channel. The live LINE API (a webhook event
// source for inbound + a /v2/bot/message/push POST for outbound) is the injected boundary:
// the pure parse/build/allowlist fns are unit-tested offline; the transport ({poll, push})
// is supplied by the caller (a real LINE channel live).
//
// Inbound shape (a LINE webhook event):
//   {type:"message", message:{type:"text", id, text}, source:{type:"user"|"group", userId, groupId?}, replyToken, timestamp}.
//   LINE wraps the events in {events:[...]} OR delivers a bare array. parse → InboundMessage[].
//   The source id IS the conversation key (chatId): a group event keys on source.groupId, a
//   user event on source.userId — so a reply PUSHes back to the same conversation. source.userId
//   → `from` (also the allowlist key); message.text is control-stripped → text; message.id → id;
//   source.type === "group" → isGroup. Only a type:"message" event whose message.type is "text"
//   carries routable agent text — non-message events (follow/join/postback/…) and non-text
//   message types (sticker/image/audio/…) are SKIPPED.
// Outbound: buildLinePushBody(chatId, text) → {to:<userId|groupId>, messages:[{type:"text", text}]};
//   the adapter PUSHes it via the injected transport, keyed by chatId (the source id). The PUSH
//   api is keyed by the source id (simpler than the one-time replyToken, which the parse drops).
// Enable: VANTA_LINE_TOKEN present (the channel access token). Optional VANTA_LINE_ALLOWLIST =
//   comma list of user/group ids to accept (empty → allow all). The token is a SECRET: it is only
//   ever read into the injected transport at the wire (named below), never a literal in this file.
// Anti-loop: LINE webhooks do not echo the bot's own outbound, so there is no self-message to
//   skip on the parse; were a source.userId ever to match the bot, it would be filtered at the
//   allowlist/wire (the allowlist keys on userId), not here.

// Strip C0/C1 control chars (incl. ESC, DEL) from untrusted inbound text, but KEEP
// newline (\x0a) and tab (\x09) — both are legitimate in a chat message and the agent
// input is multi-line. Defends against escape/control injection from a remote sender
// before the text reaches the agent.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

// The only event type that carries a routable chat message; the only message type that
// carries routable agent text. A follow/join/postback event, or a sticker/image/audio
// message, carries no agent-facing text and is skipped.
const MESSAGE_EVENT = "message";
const TEXT_MESSAGE = "text";
// A "group" source is multi-user; "user" (and "room") is treated as a 1:1 DM.
const GROUP_SOURCE = "group";

// One LINE webhook event as it arrives from the channel webhook. Tolerant: only the fields
// we route on are required; unknown extras (replyToken, timestamp, mode, …) are ignored by
// zod's default object parse. A non-message event, or a non-text message, fails the inner
// shapes and is dropped by the caller.
const LineEvent = z.object({
  type: z.string(),
  message: z.object({ type: z.string(), id: z.string(), text: z.string().optional() }).optional(),
  source: z.object({
    type: z.string(),
    userId: z.string().optional(),
    groupId: z.string().optional(),
  }),
});

/** Unwrap a LINE webhook payload to its event array: {events:[...]} OR a bare array. Pure. */
function eventsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray((json as { events?: unknown }).events)) {
    return (json as { events: unknown[] }).events;
  }
  return [];
}

/**
 * Parse a LINE webhook payload into inbound messages. Accepts both the documented
 * `{events:[...]}` wrapper AND a bare array. Keeps only a `type:"message"` event whose
 * `message.type` is `"text"` — non-message events (follow/join/postback/…) and non-text
 * message types (sticker/image/audio/…) are SKIPPED. Tolerant: a non-array/non-wrapper, or
 * any element that fails the shape, is dropped (garbage → []). Inbound text is
 * control-stripped. Pure.
 *
 * LINE's {source.groupId/userId, source.userId, message.text} map onto the shared
 * `InboundMessage` contract (`gateway/platforms/base.ts`, off-limits this round):
 * source.groupId ?? source.userId → chatId (the conversation/routing key the PUSH api uses),
 * source.userId → `from` (the sender, also the allowlist key), message.text → text,
 * message.id → id. A group source → isGroup.
 */
export function parseLineEvents(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of eventsOf(json)) {
    const parsed = LineEvent.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.type !== MESSAGE_EVENT) continue; // only a message event carries routable text
    if (e.message?.type !== TEXT_MESSAGE || e.message.text === undefined) continue; // text only
    const chatId = e.source.groupId ?? e.source.userId;
    if (chatId === undefined) continue; // no routable conversation id → cannot reply
    messages.push({
      chatId,
      from: e.source.userId,
      text: stripControl(e.message.text),
      id: e.message.id,
      isGroup: e.source.type === GROUP_SOURCE,
    });
  }
  return messages;
}

// LINE caps a text message at 5000 characters; a longer reply is split by the caller before
// reaching here, so this slice is the per-message hard cap (a defensive backstop).
const LINE_TEXT_LIMIT = 5000;

/**
 * Build the push body for POST /v2/bot/message/push: {to, messages:[{type:"text", text}]}.
 * `to` is the chatId (the source id — a userId or groupId). The text is control-stripped and
 * capped at LINE's 5000-char limit (the caller splits a long reply first; this is the
 * per-message hard cap). Pure.
 */
export function buildLinePushBody(
  chatId: string,
  text: string,
): { to: string; messages: Array<{ type: "text"; text: string }> } {
  return { to: chatId, messages: [{ type: "text", text: stripControl(text).slice(0, LINE_TEXT_LIMIT) }] };
}

/**
 * Parse the VANTA_LINE_ALLOWLIST user/group-id allowlist (comma list). Empty/absent → an
 * empty set, which the adapter treats as "allow all". Pure.
 */
export function parseLineAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_LINE_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * LINE is enabled when the channel access token is configured (VANTA_LINE_TOKEN). Not
 * configured = disabled. Pure.
 */
export function lineEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_LINE_TOKEN && env.VANTA_LINE_TOKEN.trim());
}

/**
 * The injected LINE transport — the documented live boundary. `poll` pulls new webhook events
 * (the webhook event source); `push` POSTs one push body to the LINE API. Both carry the
 * channel access token internally (see `httpTransport` below, the ONLY place the secret is
 * read). Tests pass a fake transport so no real network — and no secret — is touched.
 */
export type LineTransport = {
  poll: () => Promise<unknown>;
  push: (body: unknown) => Promise<void>;
};

export class LineAdapter implements PlatformAdapter {
  readonly id = "line";
  private readonly transport: LineTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: LineTransport; allow?: Set<string> }) {
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
    const messages = parseLineEvents(json);
    if (this.allow.size === 0) return messages;
    // Allow a message whose conversation (chatId) OR sender (from) is listed — the
    // allowlist accepts both user/group ids.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // LINE renders plain text (no markdown), so degrade the agent's markdown to readable
    // plain text, then split to the budget and PUSH each part keyed by chatId (the source id).
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, LINE_TEXT_LIMIT, "chars")) {
      await this.transport.push(buildLinePushBody(msg.chatId, part)).catch(() => {
        /* errors-as-values: a push failure must not throw through the gateway loop */
      });
    }
  }
}

// LINE Messaging API base — the injected transport joins this with the per-call path.
const LINE_API_BASE = "https://api.line.me";

/**
 * Build the live LINE REST transport. THE WIRE: the channel access token (a secret) is read
 * ONLY here, into the `Authorization: Bearer <token>` header — never stored on the adapter and
 * never a literal in this file. `poll`/`push` are errors-tolerant at the call site (poll
 * catches; the gateway loop never throws). LINE has no inbound poll endpoint (events arrive via
 * the channel webhook), so `poll` is supplied by the caller's webhook buffer in live use; the
 * default here returns no events. Live use needs a real channel access token.
 */
export function httpTransport(token: string, apiBase?: string): LineTransport {
  const base = (apiBase ?? LINE_API_BASE).replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    poll: async () => undefined, // inbound arrives via the channel webhook, not a poll endpoint
    push: async (body) => {
      await fetch(`${base}/v2/bot/message/push`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
