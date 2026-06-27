import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { buildFeishuMessage, FEISHU_TEXT_LIMIT, parseFeishuEvents } from "./feishu-parse.js";

// Feishu / Lark adapter — connects Vanta to the Feishu (open.feishu.cn) / Lark open platform,
// same PlatformAdapter contract as the other channels. Pure parse/build/allowlist fns live in
// ./feishu-parse.js (re-exported below, unit-tested offline); the live REST API
// (event-subscription webhook in, im/v1/messages POST out) is the injected transport boundary.
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

// Re-export the pure helpers so this module's public surface (used by the registry + tests)
// is unchanged after the parse/adapter split.
export {
  stripControl,
  parseFeishuEvents,
  buildFeishuMessage,
  parseFeishuAllowlist,
  feishuEnabled,
} from "./feishu-parse.js";

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
