import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { buildQQMessage, parseQQEvents, QQ_TEXT_LIMIT } from "./qq-parse.js";

// REACH-QQ-WECHAT — QQ 官方机器人 v2 adapter. Same PlatformAdapter contract as the other
// channels. Pure parse/build/allowlist fns live in ./qq-parse.js (re-exported below,
// unit-tested offline); the live REST API (webhook events in, /v2/groups POST out) is the
// injected transport boundary. Enable: VANTA_QQ_APP_ID + VANTA_QQ_APP_SECRET (the secret is
// read only into httpTransport, which mints + caches the QQBot access_token).

export {
  stripControl,
  parseQQEvents,
  buildQQMessage,
  parseQQAllowlist,
  qqEnabled,
} from "./qq-parse.js";

/**
 * The injected QQ transport — the documented live boundary. `poll` pulls new webhook events;
 * `send` POSTs one message body to /v2/groups/{group_openid}/messages. The QQBot token is
 * carried internally (see `httpTransport`). Tests pass a fake transport so no real network —
 * and no secret — is touched.
 */
export type QQTransport = {
  poll: () => Promise<unknown>;
  send: (chatId: string, body: unknown) => Promise<void>;
};

export class QQAdapter implements PlatformAdapter {
  readonly id = "qq";
  private readonly transport: QQTransport;
  private readonly allow: Set<string>;
  // Passive-reply state: last inbound msg_id per group (the reply target within QQ's 5-min
  // window) + a per-msg_id reply sequence so multi-part replies aren't deduped.
  private readonly lastMsgId = new Map<string, string>();
  private readonly seq = new Map<string, number>();

  constructor(opts: { transport: QQTransport; allow?: Set<string> }) {
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
    const messages = parseQQEvents(json);
    for (const m of messages) if (m.id) this.lastMsgId.set(m.chatId, m.id); // remember for passive reply
    if (this.allow.size === 0) return messages;
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Reply passively to the group's last inbound message (QQ caps active group messages);
    // degrade markdown to plain text, split to the budget, and send each part with a fresh seq.
    const msgId = this.lastMsgId.get(msg.chatId);
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, QQ_TEXT_LIMIT, "chars")) {
      await this.transport.send(msg.chatId, buildQQMessage(part, msgId, this.nextSeq(msgId))).catch(() => {
        /* errors-as-values: a send failure must not throw through the gateway loop */
      });
    }
  }

  /** Unique, incrementing msg_seq per msg_id so multi-part passive replies aren't deduped. */
  private nextSeq(msgId: string | undefined): number | undefined {
    if (!msgId) return undefined;
    const next = (this.seq.get(msgId) ?? 0) + 1;
    this.seq.set(msgId, next);
    return next;
  }
}

// QQ v2 endpoints. Token mint is doc-confirmed; the group send base is api.sgroup.qq.com.
const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const QQ_API_BASE = "https://api.sgroup.qq.com";
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // access_token ~2h
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

type CachedToken = { token: string; expiresAt: number };

const QQTokenResponse = z.object({
  access_token: z.string().optional(),
  expires_in: z.union([z.string(), z.number()]).optional(),
});

/**
 * Mint a fresh QQBot access_token. THE WIRE for the secret: the app secret is read ONLY here,
 * into the token-mint POST body. Returns undefined on any failure so the caller degrades to a
 * no-op send rather than throwing. Pure of module state.
 */
async function mintToken(appId: string, appSecret: string): Promise<CachedToken | undefined> {
  const res = await fetch(QQ_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId, clientSecret: appSecret }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
  if (!res || !res.ok) return undefined;
  const parsed = QQTokenResponse.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success || !parsed.data.access_token) return undefined;
  const ttlMs = (Number(parsed.data.expires_in) || 7200) * 1000;
  return { token: parsed.data.access_token, expiresAt: Date.now() + (ttlMs || DEFAULT_TTL_MS) - TOKEN_REFRESH_MARGIN_MS };
}

/**
 * Build the live QQ REST transport. The app secret is read ONLY to mint + cache a short-lived
 * QQBot access_token (re-minted lazily when expired), sent as `Authorization: QQBot <token>`.
 * QQ has no inbound poll endpoint (events arrive via the webhook), so `poll` is supplied by the
 * caller's webhook buffer in live use; the default returns no events. Live use needs real app
 * credentials + a configured callback URL.
 */
export function httpTransport(appId: string, appSecret: string): QQTransport {
  let cached: CachedToken | undefined;
  const token = async (): Promise<string | undefined> => {
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    cached = await mintToken(appId, appSecret);
    return cached?.token;
  };
  return {
    poll: async () => undefined, // inbound arrives via the webhook, not a poll endpoint
    send: async (chatId, body) => {
      const bearer = await token();
      if (!bearer) return; // could not mint a token → no-op (never throws through the loop)
      await fetch(`${QQ_API_BASE}/v2/groups/${encodeURIComponent(chatId)}/messages`, {
        method: "POST",
        headers: { Authorization: `QQBot ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
