import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { buildWhatsappSendBody, parseWhatsappWebhook, WA_TEXT_LIMIT } from "./whatsapp-parse.js";

// Re-export the pure parse/build/allowlist helpers so the public module path is unchanged —
// adapter-registry.ts and whatsapp.test.ts import them from "./whatsapp.js".
export {
  buildWhatsappSendBody,
  parseWhatsappAllowlist,
  parseWhatsappWebhook,
  stripControl,
  WA_MEDIA_REF,
  whatsappEnabled,
} from "./whatsapp-parse.js";

// MSG-ADAPTER-WHATSAPP — WhatsApp via the Meta WhatsApp Cloud API, on the same
// PlatformAdapter contract as Telegram/LINE/etc. The live API (a webhook event
// source for inbound + a /<phone-id>/messages POST for outbound) is the injected
// boundary: the pure parse/build/allowlist fns (in `whatsapp-parse.ts`) are unit-tested
// offline; the transport ({poll, push}) is supplied by the caller (a real WhatsApp number live).
//
// Outbound: buildWhatsappSendBody(to, text) → the adapter POSTs it via the injected transport
//   keyed by chatId (the wa_id). The token is a SECRET: read only into the injected transport at
//   the wire (httpTransport), never a literal in this file.

/** Injected transport — the live boundary. `poll` pulls webhook events; `push` POSTs a send body. */
export type WhatsappTransport = {
  poll: () => Promise<unknown>;
  push: (body: unknown) => Promise<void>;
};

export class WhatsappAdapter implements PlatformAdapter {
  readonly id = "whatsapp";
  private readonly transport: WhatsappTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: WhatsappTransport; allow?: Set<string> }) {
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
    const messages = parseWhatsappWebhook(json);
    if (this.allow.size === 0) return messages;
    return messages.filter((m) => this.allow.has(m.chatId));
  }

  async send(msg: OutboundMessage): Promise<void> {
    const formatted = formatForDialect(msg.text, "plain"); // WhatsApp renders plain text
    for (const part of splitForLimit(formatted, WA_TEXT_LIMIT, "chars")) {
      await this.transport.push(buildWhatsappSendBody(msg.chatId, part)).catch(() => {
        /* errors-as-values: a push failure must not throw through the gateway loop */
      });
    }
  }
}

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/**
 * Build the live WhatsApp Cloud REST transport. THE WIRE: the access token (a secret) is read
 * ONLY here, into `Authorization: Bearer <token>`. `push` POSTs to /<phone-id>/messages. WhatsApp
 * has no inbound poll endpoint (events arrive via the webhook), so `poll` is supplied by the
 * caller's webhook buffer in live use; the default returns no events. Live use needs a real
 * Cloud API access token + phone-number id.
 */
export function httpTransport(token: string, phoneId: string, apiBase?: string): WhatsappTransport {
  const base = (apiBase ?? GRAPH_API_BASE).replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    poll: async () => undefined, // inbound arrives via the webhook, not a poll endpoint
    push: async (body) => {
      await fetch(`${base}/${phoneId}/messages`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
