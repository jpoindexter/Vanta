import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { buildWeChatMessage, parseWeChatEvents, WECHAT_TEXT_LIMIT } from "./wechat-parse.js";

// REACH-QQ-WECHAT — WeChat Official Account (微信公众号) adapter. Same PlatformAdapter contract
// as the other channels. Pure parse/build/allowlist fns live in ./wechat-parse.js (re-exported
// below, unit-tested offline); the live REST API (message-XML webhook in, custom/send POST out)
// is the injected transport boundary. Enable: VANTA_WECHAT_APP_ID + VANTA_WECHAT_APP_SECRET
// (the secret is read only into httpTransport, which mints + caches the access_token).

export {
  stripControl,
  parseWeChatMessage,
  parseWeChatEvents,
  buildWeChatMessage,
  parseWeChatAllowlist,
  wechatEnabled,
} from "./wechat-parse.js";

/**
 * The injected WeChat transport — the documented live boundary. `poll` pulls new webhook XML
 * events; `send` POSTs one custom-message body to /cgi-bin/message/custom/send. The access_token
 * is carried internally (see `httpTransport`). Tests pass a fake transport so no real network —
 * and no secret — is touched.
 */
export type WeChatTransport = {
  poll: () => Promise<unknown>;
  send: (body: unknown) => Promise<void>;
};

export class WeChatAdapter implements PlatformAdapter {
  readonly id = "wechat";
  private readonly transport: WeChatTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: WeChatTransport; allow?: Set<string> }) {
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
    const messages = parseWeChatEvents(json);
    if (this.allow.size === 0) return messages;
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Custom text messages render plain (no markdown); degrade, split to the budget, and send
    // each part keyed by the user openid (chatId).
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, WECHAT_TEXT_LIMIT, "chars")) {
      await this.transport.send(buildWeChatMessage(msg.chatId, part)).catch(() => {
        /* errors-as-values: a send failure must not throw through the gateway loop */
      });
    }
  }
}

const WECHAT_API_BASE = "https://api.weixin.qq.com";
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // access_token ~2h
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

type CachedToken = { token: string; expiresAt: number };

const WeChatTokenResponse = z.object({
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
});

/**
 * Mint a fresh access_token. THE WIRE for the secret: the app secret is read ONLY here, into the
 * token GET query. Returns undefined on any failure so the caller degrades to a no-op send rather
 * than throwing. Pure of module state.
 */
async function mintToken(appId: string, appSecret: string): Promise<CachedToken | undefined> {
  const url =
    `${WECHAT_API_BASE}/cgi-bin/token?grant_type=client_credential` +
    `&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  if (!res || !res.ok) return undefined;
  const parsed = WeChatTokenResponse.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success || !parsed.data.access_token) return undefined;
  const ttlMs = (parsed.data.expires_in ?? 7200) * 1000;
  return { token: parsed.data.access_token, expiresAt: Date.now() + (ttlMs || DEFAULT_TTL_MS) - TOKEN_REFRESH_MARGIN_MS };
}

/**
 * Build the live WeChat REST transport. The app secret is read ONLY to mint + cache a short-lived
 * access_token (re-minted lazily when expired), passed as the `access_token` query param. WeChat
 * has no inbound poll endpoint (message XML arrives via the webhook), so `poll` is supplied by the
 * caller's webhook buffer in live use; the default returns no events. Live use needs a real
 * Official Account (appid + secret) and a verified server URL.
 */
export function httpTransport(appId: string, appSecret: string): WeChatTransport {
  let cached: CachedToken | undefined;
  const token = async (): Promise<string | undefined> => {
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    cached = await mintToken(appId, appSecret);
    return cached?.token;
  };
  return {
    poll: async () => undefined, // inbound arrives via the message webhook, not a poll endpoint
    send: async (body) => {
      const t = await token();
      if (!t) return; // could not mint a token → no-op (never throws through the loop)
      await fetch(`${WECHAT_API_BASE}/cgi-bin/message/custom/send?access_token=${encodeURIComponent(t)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
