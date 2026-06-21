import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Discord adapter — connects Vanta to Discord as a messaging channel, implementing
// the same PlatformAdapter contract as Telegram so the gateway treats it like any
// other channel. The live Discord API (bot token + REST send + gateway/poll) is the
// injected boundary: the pure parse/build/allowlist fns are unit-tested offline; the
// transport ({fetchJson, postJson}) is supplied by the caller (real Discord REST live).
//
// Inbound shape (Discord message object): {id, channel_id, author:{id, bot}, content}.
//   parse  → InboundMessage[] (bot-authored messages are SKIPPED to avoid reply loops).
// Outbound: POST /channels/<channel_id>/messages {content} (content capped at 2000).
// Enable: VANTA_DISCORD_TOKEN present. Optional VANTA_DISCORD_ALLOWLIST = comma list
// of channel/user ids to accept (empty → allow all). The bot token is a SECRET: it is
// only ever read into the injected transport's Authorization header at the wire (named
// below), never a literal in this file.

// Discord caps a message's content at 2000 characters.
const DISCORD_CONTENT_LIMIT = 2000;

// One Discord message object as it arrives from the REST channel-messages endpoint or
// a gateway MESSAGE_CREATE payload. Tolerant: only the fields we route on are required;
// unknown extras are ignored by zod's default object parse.
const DiscordMessage = z.object({
  id: z.string(),
  channel_id: z.string(),
  content: z.string(),
  author: z.object({ id: z.string(), bot: z.boolean().optional() }),
});

// Strip C0/C1 control chars (incl. ESC, DEL) from untrusted inbound text, but KEEP
// newline (\x0a) and tab (\x09) — both are legitimate in a chat message and the agent
// input is multi-line, unlike a single transcript line. Defends against escape/control
// injection from a remote sender before the text reaches the agent.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

/**
 * Parse a Discord messages payload (an array of message objects, e.g. from
 * GET /channels/<id>/messages or a gateway batch) into inbound messages. Skips
 * bot-authored messages (author.bot === true) so the bot never replies to itself or
 * another bot — the anti-loop guard. Tolerant: a non-array, or any element that fails
 * the shape, is dropped (garbage → []). Inbound text is control-stripped. Pure.
 *
 * Discord's {channel_id, author.id, content} map onto the shared `InboundMessage`
 * contract (`gateway/platforms/base.ts`, off-limits this round): channel_id → chatId
 * (the conversation/routing key), author.id → `from` (the sender, also the allowlist
 * key), content → text, message id → id. A Discord channel is multi-user → isGroup.
 */
export function parseDiscordMessages(json: unknown): InboundMessage[] {
  if (!Array.isArray(json)) return [];
  const messages: InboundMessage[] = [];
  for (const raw of json) {
    const parsed = DiscordMessage.safeParse(raw);
    if (!parsed.success) continue;
    const m = parsed.data;
    if (m.author.bot === true) continue; // anti-loop: never route bot messages
    messages.push({
      chatId: m.channel_id,
      from: m.author.id,
      text: stripControl(m.content),
      id: m.id,
      isGroup: true, // a Discord channel is multi-user by nature
    });
  }
  return messages;
}

/**
 * Build the REST send body for POST /channels/<id>/messages. Caps content at Discord's
 * 2000-char limit (a longer reply is split by the caller before reaching here; this is
 * the per-message hard cap). Pure.
 */
export function buildDiscordSendBody(text: string): { content: string } {
  return { content: text.slice(0, DISCORD_CONTENT_LIMIT) };
}

/**
 * Parse the VANTA_DISCORD_ALLOWLIST channel/user-id allowlist (comma list). Empty/absent
 * → an empty set, which the adapter treats as "allow all". Pure.
 */
export function parseDiscordAllowlist(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** Discord is enabled only when a bot token is configured. Pure. */
export function discordEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_DISCORD_TOKEN && env.VANTA_DISCORD_TOKEN.trim());
}

/**
 * The injected Discord transport — the documented live boundary. `fetchJson` GETs a
 * URL and returns parsed JSON (the poll source); `postJson` POSTs a JSON body to a URL.
 * Both carry the bot-token Authorization header internally (see `httpTransport` below,
 * the ONLY place the secret is read). Tests pass a fake transport so no real network is
 * touched.
 */
export type DiscordTransport = {
  fetchJson: (path: string) => Promise<unknown>;
  postJson: (path: string, body: unknown) => Promise<void>;
};

export class DiscordAdapter implements PlatformAdapter {
  readonly id = "discord";
  private readonly transport: DiscordTransport;
  private readonly channelId: string;
  private readonly allow: Set<string>;

  constructor(opts: { transport: DiscordTransport; channelId: string; allow?: Set<string> }) {
    this.transport = opts.transport;
    this.channelId = opts.channelId;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    /* stateless REST via the injected transport — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    const json = await this.transport.fetchJson(`/channels/${this.channelId}/messages`).catch(() => undefined);
    const messages = parseDiscordMessages(json);
    if (this.allow.size === 0) return messages;
    // Allow a message whose channel (chatId) OR author id (from) is listed — the
    // allowlist accepts both channel and user ids.
    return messages.filter((m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)));
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Strip markdown? Discord renders markdown natively, so keep it ("markdown" dialect
    // is a no-op transform) — only split to the 2000-char budget, then build each body.
    const formatted = formatForDialect(msg.text, "markdown");
    for (const part of splitForLimit(formatted, DISCORD_CONTENT_LIMIT, "chars")) {
      await this.transport.postJson(`/channels/${msg.chatId}/messages`, buildDiscordSendBody(part));
    }
  }
}

// Discord REST API base — the injected transport joins this with the per-call path.
const DISCORD_API_BASE = "https://discord.com/api/v10";

/**
 * Build the live Discord REST transport. THE WIRE: the bot token (a secret) is read
 * ONLY here, into the `Authorization: Bot <token>` header — never stored on the adapter
 * and never a literal in this file. `fetchJson`/`postJson` are errors-tolerant at the
 * call site (poll catches; the gateway loop never throws). Live use needs a real token.
 */
export function httpTransport(token: string, apiBase?: string): DiscordTransport {
  const base = (apiBase ?? DISCORD_API_BASE).replace(/\/+$/, "");
  const auth = { Authorization: `Bot ${token}`, "content-type": "application/json" };
  return {
    fetchJson: async (path) => {
      const res = await fetch(`${base}${path}`, { headers: auth, signal: AbortSignal.timeout(5000) });
      return res.ok ? res.json() : undefined;
    },
    postJson: async (path, body) => {
      await fetch(`${base}${path}`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
