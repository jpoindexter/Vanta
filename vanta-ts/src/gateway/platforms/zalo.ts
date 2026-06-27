import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { buildZaloSend, parseZaloEvents, ZALO_TEXT_LIMIT } from "./zalo-parse.js";

// Re-export the pure parse/build/allowlist helpers so the public module path is unchanged —
// adapter-registry.ts and zalo.test.ts import them from "./zalo.js".
export {
  buildZaloSend,
  parseZaloAllowlist,
  parseZaloEvents,
  stripControl,
  zaloEnabled,
} from "./zalo-parse.js";

// Zalo adapter — connects Vanta to the Zalo Official Account (OA) API as a messaging
// channel, implementing the same PlatformAdapter contract as LINE/Telegram/Discord so the
// gateway treats it like any other channel. The live Zalo OA API (a webhook event source for
// inbound + a /v3.0/oa/message/cs POST for outbound) is the injected boundary: the pure
// parse/build/allowlist fns (in `zalo-parse.ts`) are unit-tested offline; the transport
// ({poll, send}) is supplied by the caller (a real Zalo OA channel live).
//
// Outbound: buildZaloSend(userId, text) → the adapter POSTs it via the injected transport,
//   keyed by chatId (the user id). The token is a SECRET: only ever read into the injected
//   transport at the wire (httpTransport), never a literal in this file.

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
