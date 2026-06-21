import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Google Chat adapter — connects Vanta to Google Chat as a messaging channel,
// implementing the same PlatformAdapter contract as Telegram/Discord/Matrix so the
// gateway treats it like any other channel. The live Chat API (a bot/event source for
// inbound + a spaces.messages.create POST for outbound) is the injected boundary: the
// pure parse/build/allowlist fns are unit-tested offline; the transport ({poll,
// postMessage}) is supplied by the caller (a real Chat bot live).
//
// Inbound shape (a Google Chat event):
//   {type:"MESSAGE", message:{name, sender:{name, type}, text, space:{name}}}.
//   parse → InboundMessage[]. The space name IS the conversation key (chatId), so a reply
//   threads back to the same space; sender.name → `from` (also the allowlist key); text is
//   control-stripped → text; message.name → id. A Chat space is multi-user → isGroup.
//   BOT-sent events (message.sender.type === "BOT") are SKIPPED so the bot never replies to
//   its own (or another bot's) message — the anti-loop guard. Non-MESSAGE event types
//   (ADDED_TO_SPACE/REMOVED_FROM_SPACE/CARD_CLICKED/…) carry no agent text and are SKIPPED.
// Outbound: buildGoogleChatSend(text) → {text}; the adapter POSTs it to the space via the
//   injected transport.
// Enable: VANTA_GOOGLE_CHAT_TOKEN present (a service-account / OAuth bearer token). The
//   existing google OAuth flow (`vanta auth google`) can supply that token instead — wire it
//   into the injected transport the same way. Optional VANTA_GOOGLE_CHAT_ALLOWLIST = comma
//   list of space/sender names to accept (empty → allow all). The token is a SECRET: it is
//   only ever read into the injected transport at the wire (named below), never a literal in
//   this file.

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

// The only event type that carries a routable chat message. ADDED_TO_SPACE,
// REMOVED_FROM_SPACE, CARD_CLICKED, etc. carry no agent-facing text and are skipped.
const MESSAGE_EVENT = "MESSAGE";
// A sender whose type is BOT is a bot (Vanta itself or another bot) — never routed.
const BOT_SENDER = "BOT";

// One Google Chat event as it arrives from the bot endpoint. Tolerant: only the fields we
// route on are required; unknown extras are ignored by zod's default object parse. A
// non-MESSAGE event (or any malformed payload) fails this shape and is dropped.
const GoogleChatEvent = z.object({
  type: z.string(),
  message: z.object({
    name: z.string(),
    text: z.string(),
    sender: z.object({ name: z.string(), type: z.string().optional() }),
    space: z.object({ name: z.string() }),
  }),
});

/**
 * Parse a Google Chat events payload (an array of events) into inbound messages. Skips any
 * event whose `message.sender.type` is "BOT" so the bot never replies to itself or another
 * bot — the anti-loop guard. Skips any event whose `type` is not "MESSAGE" (ADDED_TO_SPACE /
 * CARD_CLICKED / … carry no agent text). Tolerant: a non-array, or any element that fails the
 * MESSAGE shape, is dropped (garbage → []). Inbound text is control-stripped. Pure.
 *
 * Google Chat's {message.space.name, message.sender.name, message.text} map onto the shared
 * `InboundMessage` contract (`gateway/platforms/base.ts`, off-limits this round):
 * message.space.name → chatId (the conversation/routing key), message.sender.name → `from`
 * (the sender, also the allowlist key), message.text → text, message.name → id. A Chat space
 * is multi-user → isGroup.
 */
export function parseGoogleChatEvents(json: unknown): InboundMessage[] {
  if (!Array.isArray(json)) return [];
  const messages: InboundMessage[] = [];
  for (const raw of json) {
    const parsed = GoogleChatEvent.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.type !== MESSAGE_EVENT) continue; // only a MESSAGE event carries routable text
    if (e.message.sender.type === BOT_SENDER) continue; // anti-loop: never route bot messages
    messages.push({
      chatId: e.message.space.name,
      from: e.message.sender.name,
      text: stripControl(e.message.text),
      id: e.message.name,
      isGroup: true, // a Google Chat space is multi-user by nature
    });
  }
  return messages;
}

/**
 * Build the send body for spaces.messages.create. A Google Chat text message is {text}; the
 * text is control-stripped (the agent's reply is trusted, but the strip keeps outbound bytes
 * clean and matches inbound handling). Pure.
 */
export function buildGoogleChatSend(text: string): { text: string } {
  return { text: stripControl(text) };
}

/**
 * Parse the VANTA_GOOGLE_CHAT_ALLOWLIST space/sender-name allowlist (comma list).
 * Empty/absent → an empty set, which the adapter treats as "allow all". Pure.
 */
export function parseGoogleChatAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_GOOGLE_CHAT_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Google Chat is enabled when a bearer token is configured (VANTA_GOOGLE_CHAT_TOKEN — a
 * service-account or OAuth token). The existing google OAuth (`vanta auth google`) can supply
 * that token instead by wiring it into the injected transport. Pure.
 */
export function googleChatEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_GOOGLE_CHAT_TOKEN && env.VANTA_GOOGLE_CHAT_TOKEN.trim());
}

// Google Chat caps a message's text well above any chat reply; split at a generous char
// budget so a long agent reply is SENT AS MULTIPLE messages rather than truncated or rejected.
const GOOGLE_CHAT_TEXT_LIMIT = 4000;

/**
 * The injected Google Chat transport — the documented live boundary. `poll` pulls new events
 * (the bot/event source); `postMessage` POSTs one message to a space. Both carry the bearer
 * token internally (see `httpTransport` below, the ONLY place the secret is read). Tests pass a
 * fake transport so no real network — and no secret — is touched.
 */
export type GoogleChatTransport = {
  poll: () => Promise<unknown>;
  postMessage: (space: string, body: unknown) => Promise<void>;
};

export class GoogleChatAdapter implements PlatformAdapter {
  readonly id = "googlechat";
  private readonly transport: GoogleChatTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: GoogleChatTransport; allow?: Set<string> }) {
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
    const messages = parseGoogleChatEvents(json);
    if (this.allow.size === 0) return messages;
    // Allow a message whose space (chatId) OR sender (from) is listed — the allowlist
    // accepts both space and sender names.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Google Chat renders its own lightweight markup, not standard markdown; degrade the
    // agent's markdown to readable plain text, then split to the budget and send each part.
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, GOOGLE_CHAT_TEXT_LIMIT, "chars")) {
      await this.transport.postMessage(msg.chatId, buildGoogleChatSend(part)).catch(() => {
        /* errors-as-values: a send failure must not throw through the gateway loop */
      });
    }
  }
}

// Google Chat REST API base — the injected transport joins this with the per-call path.
const GOOGLE_CHAT_API_BASE = "https://chat.googleapis.com/v1";

/**
 * Build the live Google Chat REST transport. THE WIRE: the bearer token (a secret) is read
 * ONLY here, into the `Authorization: Bearer <token>` header — never stored on the adapter and
 * never a literal in this file. `poll`/`postMessage` are errors-tolerant at the call site (poll
 * catches; the gateway loop never throws). Live use needs a real token (service account or the
 * google OAuth token from `vanta auth google`) against a real Chat bot.
 */
export function httpTransport(token: string, apiBase?: string): GoogleChatTransport {
  const base = (apiBase ?? GOOGLE_CHAT_API_BASE).replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    poll: async () => {
      const res = await fetch(`${base}/spaces/-/messages`, {
        headers: auth,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? res.json() : undefined;
    },
    postMessage: async (space, body) => {
      await fetch(`${base}/${space}/messages`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
