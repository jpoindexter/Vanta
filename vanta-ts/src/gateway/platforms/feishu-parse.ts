import { z } from "zod";
import type { InboundMessage } from "./base.js";

// Feishu / Lark — pure helpers: inbound event parse, outbound body build, allowlist +
// enable checks, and the per-message char cap. Sibling to feishu.ts (the stateful adapter
// + live REST transport that mints the tenant_access_token), which imports + re-exports
// these so the module's public surface (registry + tests) is unchanged. No secret here.

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
// under the byte limit). feishu.ts reuses it as the outbound split budget.
export const FEISHU_TEXT_LIMIT = 4000;

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
