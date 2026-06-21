import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// MSG-ADAPTER-SLACK — Slack via the Events API (inbound) + chat.postMessage
// (outbound), on the same PlatformAdapter contract as Telegram/WhatsApp/etc. The
// live Slack API is the injected boundary: pure parse/build/allowlist fns are
// unit-tested offline; the transport ({poll, push}) is supplied by the caller
// (a real Slack app live).
//
// Inbound (a Slack Events API envelope):
//   {type:"event_callback", event:{type:"message", channel, user, text, ts, bot_id?, subtype?}}.
//   event.channel IS the conversation key (chatId) — a reply POSTs back to it. event.user → from;
//   event.text is control-stripped → text; event.ts → id; a "D" channel is a DM (isGroup false),
//   any other (C/G) is a channel (isGroup true). Only a plain user message routes: an event with
//   bot_id (the bot's own / another bot's post) or a subtype (bot_message/channel_join/
//   message_changed/…) is SKIPPED — this is the anti-loop guard (Slack echoes the bot's own posts).
// Outbound: buildSlackPostBody(chatId, text) → {channel, text}; the adapter POSTs it to
//   chat.postMessage via the injected transport keyed by chatId.
// Enable: VANTA_SLACK_BOT_TOKEN (the xoxb- bot token). Optional VANTA_SLACK_ALLOWLIST = comma
//   list of channel ids to accept (empty → allow all). The token is a SECRET: read only into the
//   injected transport at the wire (httpTransport), never a literal in this file.

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

const EVENT_CALLBACK = "event_callback";
const MESSAGE = "message";
const DM_PREFIX = "D"; // a "D" channel id is a 1:1 DM; C/G are channels.

const SlackEvent = z.object({
  type: z.string(),
  channel: z.string().optional(),
  user: z.string().optional(),
  text: z.string().optional(),
  ts: z.string().optional(),
  bot_id: z.string().optional(),
  subtype: z.string().optional(),
});
const SlackEnvelope = z.object({ type: z.string(), event: SlackEvent.optional() });

/** A payload may be a single envelope or an array of them. Pure. */
function envelopesOf(json: unknown): unknown[] {
  return Array.isArray(json) ? json : [json];
}

/**
 * Parse a Slack Events payload into inbound messages. Keeps only a plain user
 * `message` event — an event with `bot_id` or a `subtype` is SKIPPED (anti-loop:
 * Slack echoes the bot's own posts as bot_id events). Inbound text is
 * control-stripped. Tolerant: garbage → []. Pure.
 */
function toInbound(raw: unknown): InboundMessage | null {
  const parsed = SlackEnvelope.safeParse(raw);
  if (!parsed.success || parsed.data.type !== EVENT_CALLBACK) return null;
  const e = parsed.data.event;
  if (!e || e.type !== MESSAGE || e.bot_id || e.subtype) return null; // plain user message only
  if (!e.channel || e.text === undefined || !e.user) return null; // need a routable conversation
  return {
    chatId: e.channel,
    from: e.user,
    text: stripControl(e.text),
    id: e.ts,
    isGroup: !e.channel.startsWith(DM_PREFIX),
  };
}

export function parseSlackEvents(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of envelopesOf(json)) {
    const m = toInbound(raw);
    if (m) messages.push(m);
  }
  return messages;
}

// Slack accepts up to ~40k chars but recommends well under 4000 per message; the caller
// splits a longer reply first, so this is the per-message hard cap.
const SLACK_TEXT_LIMIT = 3900;

/** Build the chat.postMessage body: {channel, text}. Pure. */
export function buildSlackPostBody(chatId: string, text: string): { channel: string; text: string } {
  return { channel: chatId, text: stripControl(text).slice(0, SLACK_TEXT_LIMIT) };
}

/** Parse VANTA_SLACK_ALLOWLIST (comma list of channel ids). Empty → allow all. Pure. */
export function parseSlackAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_SLACK_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
}

/** Enabled when the bot token is configured. Pure. */
export function slackEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_SLACK_BOT_TOKEN?.trim());
}

/** Injected transport — the live boundary. `poll` pulls events; `push` POSTs a message body. */
export type SlackTransport = {
  poll: () => Promise<unknown>;
  push: (body: unknown) => Promise<void>;
};

export class SlackAdapter implements PlatformAdapter {
  readonly id = "slack";
  private readonly transport: SlackTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: SlackTransport; allow?: Set<string> }) {
    this.transport = opts.transport;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    /* stateless REST via the injected transport */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    const json = await this.transport.poll().catch(() => undefined);
    const messages = parseSlackEvents(json);
    if (this.allow.size === 0) return messages;
    return messages.filter((m) => this.allow.has(m.chatId));
  }

  async send(msg: OutboundMessage): Promise<void> {
    const formatted = formatForDialect(msg.text, "plain"); // avoid mrkdwn surprises
    for (const part of splitForLimit(formatted, SLACK_TEXT_LIMIT, "chars")) {
      await this.transport.push(buildSlackPostBody(msg.chatId, part)).catch(() => {
        /* errors-as-values: a push failure must not throw through the gateway loop */
      });
    }
  }
}

const SLACK_API_BASE = "https://slack.com/api";

/**
 * Build the live Slack REST transport. THE WIRE: the bot token (a secret) is read ONLY here,
 * into `Authorization: Bearer <token>`. `push` POSTs to chat.postMessage. Slack delivers inbound
 * via the Events API webhook, so `poll` is supplied by the caller's webhook buffer in live use;
 * the default returns no events. Live use needs a real xoxb- bot token.
 */
export function httpTransport(token: string, apiBase?: string): SlackTransport {
  const base = (apiBase ?? SLACK_API_BASE).replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" };
  return {
    poll: async () => undefined, // inbound arrives via the Events API webhook, not a poll endpoint
    push: async (body) => {
      await fetch(`${base}/chat.postMessage`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
