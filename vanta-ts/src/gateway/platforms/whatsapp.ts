import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// MSG-ADAPTER-WHATSAPP — WhatsApp via the Meta WhatsApp Cloud API, on the same
// PlatformAdapter contract as Telegram/LINE/etc. The live API (a webhook event
// source for inbound + a /<phone-id>/messages POST for outbound) is the injected
// boundary: the pure parse/build/allowlist fns are unit-tested offline; the
// transport ({poll, push}) is supplied by the caller (a real WhatsApp number live).
//
// Inbound (a WhatsApp Cloud webhook):
//   {object, entry:[{changes:[{value:{messages:[{from:<wa_id>, id, type:"text", text:{body}}],
//     contacts:[{profile:{name}, wa_id}]}}]}]}.
//   from (the sender wa_id) IS the conversation key (chatId) — a reply POSTs back to it.
//   contacts[].profile.name → `from` (display); message.text.body is control-stripped → text;
//   message.id → id. WhatsApp Cloud bot messages are 1:1 → isGroup false. Only a type:"text"
//   message carries routable text — status updates (sent/delivered/read) and non-text types
//   (image/audio/sticker/…) are SKIPPED.
// Outbound: buildWhatsappSendBody(to, text) → the Cloud API text-message body; the adapter
//   POSTs it via the injected transport keyed by chatId (the wa_id).
// Enable: VANTA_WHATSAPP_TOKEN (the access token) + VANTA_WHATSAPP_PHONE_ID (the sender phone
//   number id, used in the send URL). Optional VANTA_WHATSAPP_ALLOWLIST = comma list of wa_ids
//   to accept (empty → allow all). The token is a SECRET: read only into the injected transport
//   at the wire (httpTransport), never a literal in this file.
// Anti-loop: WhatsApp webhooks deliver inbound + status updates, not the bot's own outbound
//   text echoed back, so there is no self-message to skip on the parse.

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

const TEXT_TYPE = "text";

const WaMessage = z.object({
  from: z.string(),
  id: z.string().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
});
const WaValue = z.object({
  messages: z.array(WaMessage).optional(),
  contacts: z
    .array(z.object({ profile: z.object({ name: z.string() }).optional(), wa_id: z.string().optional() }))
    .optional(),
});
type WaValueT = z.infer<typeof WaValue>;

/** Walk a Cloud webhook payload to its change `value` objects: entry[].changes[].value. Pure. */
function valuesOf(json: unknown): WaValueT[] {
  const entries = (json as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return [];
  const out: WaValueT[] = [];
  for (const e of entries) {
    const changes = (e as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      const v = WaValue.safeParse((ch as { value?: unknown })?.value);
      if (v.success) out.push(v.data);
    }
  }
  return out;
}

/**
 * Parse a WhatsApp Cloud webhook payload into inbound messages. Keeps only `type:"text"`
 * messages — status updates and non-text message types are SKIPPED. Inbound text is
 * control-stripped. `from` (wa_id) → chatId; the contact profile name (when present) → `from`;
 * message.id → id. Tolerant: garbage → []. Pure.
 */
function contactNames(value: WaValueT): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of value.contacts ?? []) {
    if (c.wa_id && c.profile?.name) map.set(c.wa_id, c.profile.name);
  }
  return map;
}

export function parseWhatsappWebhook(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const value of valuesOf(json)) {
    const names = contactNames(value);
    for (const m of value.messages ?? []) {
      if (m.type !== TEXT_TYPE || m.text === undefined) continue;
      messages.push({
        chatId: m.from,
        from: names.get(m.from) ?? m.from,
        text: stripControl(m.text.body),
        id: m.id,
        isGroup: false,
      });
    }
  }
  return messages;
}

// WhatsApp caps a text body at 4096 chars; a longer reply is split by the caller first.
const WA_TEXT_LIMIT = 4096;

/** Build the Cloud API send body: POST /<phone-id>/messages. Pure. */
export function buildWhatsappSendBody(
  to: string,
  text: string,
): { messaging_product: "whatsapp"; recipient_type: "individual"; to: string; type: "text"; text: { body: string } } {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: stripControl(text).slice(0, WA_TEXT_LIMIT) },
  };
}

/** Parse VANTA_WHATSAPP_ALLOWLIST (comma list of wa_ids). Empty → allow all. Pure. */
export function parseWhatsappAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_WHATSAPP_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
}

/** Enabled when BOTH the access token and the sender phone-number id are set. Pure. */
export function whatsappEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_WHATSAPP_TOKEN?.trim() && env.VANTA_WHATSAPP_PHONE_ID?.trim());
}

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
