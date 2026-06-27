import { z } from "zod";
import type { InboundMessage } from "./base.js";

// WhatsApp parse/build/allowlist helpers — the pure, offline-unit-tested core of the
// WhatsApp Cloud adapter. The transport + adapter class live in `whatsapp.ts`, which
// re-exports these so the public module path is unchanged.
//
// Inbound (a WhatsApp Cloud webhook):
//   {object, entry:[{changes:[{value:{messages:[{from:<wa_id>, id, type:"text", text:{body}}],
//     contacts:[{profile:{name}, wa_id}]}}]}]}.
//   from (the sender wa_id) IS the conversation key (chatId) — a reply POSTs back to it.
//   contacts[].profile.name → `from` (display); message.text.body is control-stripped → text;
//   message.id → id. WhatsApp Cloud bot messages are 1:1 → isGroup false. Only a type:"text"
//   message carries routable text — status updates (sent/delivered/read) and non-text types
//   (image/audio/sticker/…) are SKIPPED.
// Outbound: buildWhatsappSendBody(to, text) → the Cloud API text-message body, keyed by
//   chatId (the wa_id).
// Enable: VANTA_WHATSAPP_TOKEN (the access token) + VANTA_WHATSAPP_PHONE_ID (the sender phone
//   number id, used in the send URL). Optional VANTA_WHATSAPP_ALLOWLIST = comma list of wa_ids
//   to accept (empty → allow all).

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

const TEXT_TYPE = "text";
// MSG-MEDIA-IMAGES — an image/audio media object carries a media id (resolved to
// bytes live via the Cloud API, token-gated) + a mime type.
const WaMedia = z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional() });

const WaMessage = z.object({
  from: z.string(),
  id: z.string().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: WaMedia.optional(),
  audio: WaMedia.optional(),
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

// A url scheme the live media bridge resolves to bytes via the Cloud API (token-gated).
export const WA_MEDIA_REF = "wa-media:";

function mediaInbound(m: z.infer<typeof WaMessage>, from: string): InboundMessage | null {
  const kind: "image" | "audio" = m.type === "image" ? "image" : "audio";
  const media = m.image ?? m.audio;
  if (!media) return null;
  return {
    chatId: m.from,
    from,
    id: m.id,
    isGroup: false,
    text: media.caption ? stripControl(media.caption) : "",
    media: [{ kind, mime: media.mime_type ?? (kind === "image" ? "image/jpeg" : "audio/ogg"), url: WA_MEDIA_REF + media.id }],
  };
}

function toWaInbound(m: z.infer<typeof WaMessage>, names: Map<string, string>): InboundMessage | null {
  const from = names.get(m.from) ?? m.from;
  if (m.type === TEXT_TYPE) {
    return m.text ? { chatId: m.from, from, id: m.id, isGroup: false, text: stripControl(m.text.body) } : null;
  }
  if (m.type === "image" || m.type === "audio") return mediaInbound(m, from);
  return null; // status updates + other non-text/non-media types
}

export function parseWhatsappWebhook(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const value of valuesOf(json)) {
    const names = contactNames(value);
    for (const m of value.messages ?? []) {
      const inbound = toWaInbound(m, names);
      if (inbound) messages.push(inbound);
    }
  }
  return messages;
}

// WhatsApp caps a text body at 4096 chars; a longer reply is split by the caller first.
export const WA_TEXT_LIMIT = 4096;

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
