import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Feishu / Lark adapter — connects Vanta to the Feishu (open.feishu.cn) / Lark open platform,
// same PlatformAdapter contract as the other channels. Pure parse/build/allowlist fns are
// unit-tested offline; the live REST API (event-subscription webhook in, im/v1/messages POST
// out) is the injected transport boundary.
//
// Inbound = a Feishu `im.message.receive_v1` event-subscription callback. parse →
// InboundMessage[]: message.chat_id → chatId (reply routes back to the same chat);
// sender.sender_id.open_id → `from` (allowlist key); message.content is a JSON string
// `{"text":"..."}` whose .text is control-stripped → text; message_id → id; chat_type "group"
// → isGroup. Only event_type "im.message.receive_v1" with message_type "text" is routed
// (image/file/audio/post are skipped). Anti-loop: a sender_type "bot" event is skipped so
// Vanta never replies to itself.
// Outbound: buildFeishuMessage(chatId, text) → {receive_id, msg_type:"text", content} (content
// is itself a JSON string per the Feishu wire format), SENT via the injected transport.
// Enable: VANTA_FEISHU_APP_ID + VANTA_FEISHU_APP_SECRET. Optional VANTA_FEISHU_ALLOWLIST (comma
// list, empty → allow all). The app secret is read only into the injected transport
// (httpTransport, which mints+caches a tenant_access_token) — never a literal here.

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
// carries routable agent text. Other events (reaction/recall/…) and non-text message types
// (image/file/audio/post/…) carry no agent-facing text and are skipped.
const MESSAGE_EVENT = "im.message.receive_v1";
const TEXT_MESSAGE = "text";
// A "group" chat is multi-user; "p2p" is a 1:1 DM.
const GROUP_CHAT = "group";
// A sender whose type is "bot" is Vanta itself or another bot — never routed (anti-loop).
const BOT_SENDER = "bot";

// One Feishu event-subscription callback as it arrives from the webhook. Tolerant: only the
// fields we route on are required; unknown extras (schema, token, ts, app_id, …) are ignored
// by zod's default object parse. A non-message event, or a non-text message, fails the inner
// shapes and is dropped by the caller.
const FeishuEvent = z.object({
  header: z.object({ event_type: z.string() }),
  event: z.object({
    sender: z
      .object({
        sender_id: z.object({ open_id: z.string().optional() }).optional(),
        sender_type: z.string().optional(),
      })
      .optional(),
    message: z.object({
      message_id: z.string(),
      chat_id: z.string(),
      chat_type: z.string().optional(),
      message_type: z.string(),
      content: z.string(),
    }),
  }),
});

/** Unwrap a Feishu webhook payload to its event array: a single event OR a bare array. Pure. */
function eventsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") return [json]; // Feishu delivers one event per callback
  return [];
}

/**
 * Parse the JSON-string `content` of a Feishu text message (`{"text":"hi"}`) to its `.text`.
 * Tolerant: a non-object, a missing/non-string `.text`, or invalid JSON → "" (the caller drops
 * an empty-text message). Pure.
 */
function textOfContent(content: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && typeof (parsed as { text?: unknown }).text === "string") {
      return (parsed as { text: string }).text;
    }
  } catch {
    /* malformed content JSON → no routable text */
  }
  return "";
}

/**
 * Parse a Feishu event-subscription payload into inbound messages. Accepts a single event
 * object (one per webhook callback) OR a bare array. Keeps only an `im.message.receive_v1`
 * event whose `message.message_type` is `"text"` — other events and non-text message types
 * (image/file/audio/post/…) are SKIPPED. A `sender_type:"bot"` event is the bot's own outbound
 * echoed back and is SKIPPED (anti-loop). Tolerant: a non-object, or any element that fails the
 * shape, is dropped (garbage → []). Inbound text is parsed out of the JSON-string `content` and
 * control-stripped. Pure.
 *
 * Feishu's {message.chat_id, sender.sender_id.open_id, message.content.text} map onto the
 * shared `InboundMessage` contract (`gateway/platforms/base.ts`, off-limits this round):
 * message.chat_id → chatId (the conversation/routing key the send api uses),
 * sender.sender_id.open_id → `from` (the sender, also the allowlist key), the parsed
 * content.text → text, message.message_id → id. A "group" chat_type → isGroup.
 */
export function parseFeishuEvents(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of eventsOf(json)) {
    const parsed = FeishuEvent.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.header.event_type !== MESSAGE_EVENT) continue; // only a receive event carries text
    if (e.event.sender?.sender_type === BOT_SENDER) continue; // anti-loop: never route bot msgs
    if (e.event.message.message_type !== TEXT_MESSAGE) continue; // text only
    const text = textOfContent(e.event.message.content);
    if (text === "") continue; // empty/unparseable content → no routable agent text
    messages.push({
      chatId: e.event.message.chat_id,
      from: e.event.sender?.sender_id?.open_id,
      text: stripControl(text),
      id: e.event.message.message_id,
      isGroup: e.event.message.chat_type === GROUP_CHAT,
    });
  }
  return messages;
}

// Feishu caps a text message payload at 150 KB; a longer reply is split by the caller before
// reaching here, so this char slice is the per-message hard cap (a defensive backstop, well
// under the byte limit).
const FEISHU_TEXT_LIMIT = 4000;

/**
 * Build the send body for POST /open-apis/im/v1/messages?receive_id_type=chat_id:
 * {receive_id, msg_type:"text", content}. `receive_id` is the chatId. Feishu's wire format
 * nests the text inside a JSON-STRING `content` field, so the (control-stripped, capped) text
 * is `JSON.stringify({text})`. Pure.
 */
export function buildFeishuMessage(
  chatId: string,
  text: string,
): { receive_id: string; msg_type: "text"; content: string } {
  const clean = stripControl(text).slice(0, FEISHU_TEXT_LIMIT);
  return { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text: clean }) };
}

/**
 * Parse the VANTA_FEISHU_ALLOWLIST chat/sender open-id allowlist (comma list). Empty/absent →
 * an empty set, which the adapter treats as "allow all". Pure.
 */
export function parseFeishuAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_FEISHU_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Feishu is enabled when both app credentials are configured (VANTA_FEISHU_APP_ID +
 * VANTA_FEISHU_APP_SECRET). Either missing/blank = disabled. Pure.
 */
export function feishuEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.VANTA_FEISHU_APP_ID &&
      env.VANTA_FEISHU_APP_ID.trim() &&
      env.VANTA_FEISHU_APP_SECRET &&
      env.VANTA_FEISHU_APP_SECRET.trim(),
  );
}

/**
 * The injected Feishu transport — the documented live boundary. `poll` pulls new webhook events
 * (the event-subscription source); `send` POSTs one message body to the im/v1/messages API. Both
 * carry the tenant_access_token (minted from the app credentials) internally (see `httpTransport`
 * below, the ONLY place the secret is read). Tests pass a fake transport so no real network — and
 * no secret — is touched.
 */
export type FeishuTransport = {
  poll: () => Promise<unknown>;
  send: (body: unknown) => Promise<void>;
};

export class FeishuAdapter implements PlatformAdapter {
  readonly id = "feishu";
  private readonly transport: FeishuTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: FeishuTransport; allow?: Set<string> }) {
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
    const messages = parseFeishuEvents(json);
    if (this.allow.size === 0) return messages;
    // Allow a message whose conversation (chatId) OR sender (from) is listed — the
    // allowlist accepts both chat and sender open-ids.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Feishu text messages render plain text (no markdown), so degrade the agent's markdown to
    // readable plain text, then split to the budget and SEND each part keyed by chatId.
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, FEISHU_TEXT_LIMIT, "chars")) {
      await this.transport.send(buildFeishuMessage(msg.chatId, part)).catch(() => {
        /* errors-as-values: a send failure must not throw through the gateway loop */
      });
    }
  }
}

// Feishu open-platform base — the injected transport joins this with the per-call path. Lark
// International callers override via apiBase to https://open.larksuite.com/open-apis.
const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";
// A tenant_access_token is valid ~2h; refresh a minute early to avoid an expiry race.
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

/** A minted tenant_access_token plus its computed expiry instant. */
type CachedToken = { token: string; expiresAt: number };

const FeishuTokenResponse = z.object({
  code: z.number(),
  tenant_access_token: z.string().optional(),
  expire: z.number().optional(),
});

/**
 * Mint a fresh tenant_access_token from the app credentials. THE WIRE for the secret: the app
 * secret is read ONLY here, into the token-mint POST body — never stored on the adapter and never
 * a literal elsewhere. Returns undefined on any failure (non-ok HTTP, non-zero code, missing
 * token) so the caller degrades to a no-op send rather than throwing. The Feishu `expire` is in
 * seconds; we cache against a refresh-margined deadline. Pure of module state.
 */
async function mintToken(base: string, appId: string, appSecret: string): Promise<CachedToken | undefined> {
  const res = await fetch(`${base}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
  if (!res || !res.ok) return undefined;
  const parsed = FeishuTokenResponse.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success || parsed.data.code !== 0 || !parsed.data.tenant_access_token) return undefined;
  const ttl = parsed.data.expire ? parsed.data.expire * 1000 : TOKEN_TTL_MS;
  return { token: parsed.data.tenant_access_token, expiresAt: Date.now() + ttl - TOKEN_REFRESH_MARGIN_MS };
}

/**
 * Build the live Feishu REST transport. The app secret (a secret) is read ONLY here, used to mint
 * + CACHE a short-lived tenant_access_token internally (re-minted lazily when expired) which is
 * then sent as `Authorization: Bearer <token>`. `poll`/`send` are errors-tolerant at the call site
 * (poll catches; the gateway loop never throws). Feishu has no inbound poll endpoint (events arrive
 * via the event-subscription webhook), so `poll` is supplied by the caller's webhook buffer in live
 * use; the default here returns no events. `apiBase` overrides the host for Lark International
 * (https://open.larksuite.com/open-apis). Live use needs real app credentials.
 */
export function httpTransport(appId: string, appSecret: string, apiBase?: string): FeishuTransport {
  const base = (apiBase ?? FEISHU_API_BASE).replace(/\/+$/, "");
  let cached: CachedToken | undefined;
  const token = async (): Promise<string | undefined> => {
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    cached = await mintToken(base, appId, appSecret);
    return cached?.token;
  };
  return {
    poll: async () => undefined, // inbound arrives via the event-subscription webhook, not a poll
    send: async (body) => {
      const bearer = await token();
      if (!bearer) return; // could not mint a token → no-op (never throws through the loop)
      await fetch(`${base}/im/v1/messages?receive_id_type=chat_id`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
