import { z } from "zod";
import type { InboundMessage } from "./base.js";

// LINE parse/build/allowlist helpers — the pure, offline-unit-tested core of the LINE
// adapter. The transport + adapter class live in `line.ts`, which re-exports these so the
// public module path is unchanged.
//
// Inbound shape (a LINE webhook event):
//   {type:"message", message:{type:"text", id, text}, source:{type:"user"|"group", userId, groupId?}, replyToken, timestamp}.
//   LINE wraps the events in {events:[...]} OR delivers a bare array. parse → InboundMessage[].
//   The source id IS the conversation key (chatId): a group event keys on source.groupId, a
//   user event on source.userId — so a reply PUSHes back to the same conversation. source.userId
//   → `from` (also the allowlist key); message.text is control-stripped → text; message.id → id;
//   source.type === "group" → isGroup. Only a type:"message" event whose message.type is "text"
//   carries routable agent text — non-message events (follow/join/postback/…) and non-text
//   message types (sticker/image/audio/…) are SKIPPED.
// Outbound: buildLinePushBody(chatId, text) → {to:<userId|groupId>, messages:[{type:"text", text}]};
//   keyed by chatId (the source id). The PUSH api is keyed by the source id (simpler than the
//   one-time replyToken, which the parse drops).
// Enable: VANTA_LINE_TOKEN present (the channel access token). Optional VANTA_LINE_ALLOWLIST =
//   comma list of user/group ids to accept (empty → allow all).
// Anti-loop: LINE webhooks do not echo the bot's own outbound, so there is no self-message to
//   skip on the parse; were a source.userId ever to match the bot, it would be filtered at the
//   allowlist/wire (the allowlist keys on userId), not here.

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
// carries routable agent text. A follow/join/postback event, or a sticker/image/audio
// message, carries no agent-facing text and is skipped.
const MESSAGE_EVENT = "message";
const TEXT_MESSAGE = "text";
// A "group" source is multi-user; "user" (and "room") is treated as a 1:1 DM.
const GROUP_SOURCE = "group";

// One LINE webhook event as it arrives from the channel webhook. Tolerant: only the fields
// we route on are required; unknown extras (replyToken, timestamp, mode, …) are ignored by
// zod's default object parse. A non-message event, or a non-text message, fails the inner
// shapes and is dropped by the caller.
const LineEvent = z.object({
  type: z.string(),
  message: z.object({ type: z.string(), id: z.string(), text: z.string().optional() }).optional(),
  source: z.object({
    type: z.string(),
    userId: z.string().optional(),
    groupId: z.string().optional(),
  }),
});

/** Unwrap a LINE webhook payload to its event array: {events:[...]} OR a bare array. Pure. */
function eventsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object" && Array.isArray((json as { events?: unknown }).events)) {
    return (json as { events: unknown[] }).events;
  }
  return [];
}

/**
 * Parse a LINE webhook payload into inbound messages. Accepts both the documented
 * `{events:[...]}` wrapper AND a bare array. Keeps only a `type:"message"` event whose
 * `message.type` is `"text"` — non-message events (follow/join/postback/…) and non-text
 * message types (sticker/image/audio/…) are SKIPPED. Tolerant: a non-array/non-wrapper, or
 * any element that fails the shape, is dropped (garbage → []). Inbound text is
 * control-stripped. Pure.
 *
 * LINE's {source.groupId/userId, source.userId, message.text} map onto the shared
 * `InboundMessage` contract (`gateway/platforms/base.ts`, off-limits this round):
 * source.groupId ?? source.userId → chatId (the conversation/routing key the PUSH api uses),
 * source.userId → `from` (the sender, also the allowlist key), message.text → text,
 * message.id → id. A group source → isGroup.
 */
export function parseLineEvents(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of eventsOf(json)) {
    const parsed = LineEvent.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.type !== MESSAGE_EVENT) continue; // only a message event carries routable text
    if (e.message?.type !== TEXT_MESSAGE || e.message.text === undefined) continue; // text only
    const chatId = e.source.groupId ?? e.source.userId;
    if (chatId === undefined) continue; // no routable conversation id → cannot reply
    messages.push({
      chatId,
      from: e.source.userId,
      text: stripControl(e.message.text),
      id: e.message.id,
      isGroup: e.source.type === GROUP_SOURCE,
    });
  }
  return messages;
}

// LINE caps a text message at 5000 characters; a longer reply is split by the caller before
// reaching here, so this slice is the per-message hard cap (a defensive backstop).
export const LINE_TEXT_LIMIT = 5000;

/**
 * Build the push body for POST /v2/bot/message/push: {to, messages:[{type:"text", text}]}.
 * `to` is the chatId (the source id — a userId or groupId). The text is control-stripped and
 * capped at LINE's 5000-char limit (the caller splits a long reply first; this is the
 * per-message hard cap). Pure.
 */
export function buildLinePushBody(
  chatId: string,
  text: string,
): { to: string; messages: Array<{ type: "text"; text: string }> } {
  return { to: chatId, messages: [{ type: "text", text: stripControl(text).slice(0, LINE_TEXT_LIMIT) }] };
}

/**
 * Parse the VANTA_LINE_ALLOWLIST user/group-id allowlist (comma list). Empty/absent → an
 * empty set, which the adapter treats as "allow all". Pure.
 */
export function parseLineAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_LINE_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * LINE is enabled when the channel access token is configured (VANTA_LINE_TOKEN). Not
 * configured = disabled. Pure.
 */
export function lineEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_LINE_TOKEN && env.VANTA_LINE_TOKEN.trim());
}
