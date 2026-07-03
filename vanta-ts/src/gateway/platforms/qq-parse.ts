import { z } from "zod";
import type { InboundMessage } from "./base.js";

// QQ 官方机器人 (Official Bot) v2 — pure helpers: inbound webhook event parse, outbound
// body build, allowlist + enable checks, per-message cap. Sibling to qq.ts (the stateful
// adapter + live REST transport that mints the QQBot access_token). No secret here.
//
// WIRE FORMAT (documented assumption; the live tree is the boundary, same convention as
// feishu.ts): inbound arrives as the QQ v2 webhook envelope {op, id, d, t}. We route the
// group @-message event GROUP_AT_MESSAGE_CREATE, whose `d` carries:
//   d.group_openid       → chatId (reply routes to POST /v2/groups/{group_openid}/messages)
//   d.author.member_openid → from  (sender / allowlist key)
//   d.content            → text    (the @mention is stripped by the platform; we trim)
//   d.id                 → id      (inbound msg id — REQUIRED as msg_id for a passive reply)
// Only a group @-message carries routable agent text this slice; other events are skipped.
// Send is doc-confirmed: POST https://api.sgroup.qq.com/v2/groups/{group_openid}/messages,
// Authorization: QQBot <access_token>, body {content, msg_type:0, msg_id, msg_seq}. A passive
// reply (msg_id set) is required — active group messages are hard-capped by QQ (4/month).

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip C0/C1 control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

const GROUP_AT_MESSAGE = "GROUP_AT_MESSAGE_CREATE";

// One QQ v2 webhook event. Tolerant: only the fields we route on are required; unknown
// extras (op, id, timestamp, author.union_openid, …) are ignored. A non-group event fails
// the `t` check and is dropped by the caller.
const QQEvent = z.object({
  t: z.string().optional(),
  d: z.object({
    id: z.string(),
    content: z.string(),
    group_openid: z.string(),
    author: z.object({ member_openid: z.string().optional() }).optional(),
  }),
});

/** Unwrap a QQ webhook payload to its event array: a single event OR a bare array. Pure. */
function eventsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") return [json]; // QQ delivers one event per callback
  return [];
}

/**
 * Parse a QQ v2 webhook payload into inbound messages. Keeps only a
 * GROUP_AT_MESSAGE_CREATE event with routable text; everything else is SKIPPED.
 * Tolerant: a non-object, or any element that fails the shape, is dropped. Inbound
 * text is control-stripped and trimmed (the platform-stripped @mention leaves a
 * leading space). Pure.
 */
export function parseQQEvents(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of eventsOf(json)) {
    const parsed = QQEvent.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.t !== GROUP_AT_MESSAGE) continue; // only a group @-message carries agent text
    const text = stripControl(e.d.content).trim();
    if (text === "") continue; // empty content → no routable agent text
    messages.push({
      chatId: e.d.group_openid,
      from: e.d.author?.member_openid,
      text,
      id: e.d.id, // the msg_id a passive reply must echo (5-min window — see qq.ts)
      isGroup: true,
    });
  }
  return messages;
}

// QQ group text messages cap well above this; the split budget is a defensive backstop.
export const QQ_TEXT_LIMIT = 4000;

export type QQMessageBody = { content: string; msg_type: 0; msg_id?: string; msg_seq?: number };

/**
 * Build the v2 group send body: {content, msg_type:0 (text)}. When replying to an inbound
 * message, `msgId` makes it a PASSIVE reply (required — active messages are rate-capped) and
 * `msgSeq` uniquely orders multiple reply-parts to the same msg_id (else QQ dedups them). Pure.
 */
export function buildQQMessage(text: string, msgId?: string, msgSeq?: number): QQMessageBody {
  const body: QQMessageBody = { content: stripControl(text).slice(0, QQ_TEXT_LIMIT), msg_type: 0 };
  if (msgId) body.msg_id = msgId;
  if (msgSeq !== undefined) body.msg_seq = msgSeq;
  return body;
}

/** Parse VANTA_QQ_ALLOWLIST (comma list of group_openid/member_openid). Empty → allow all. Pure. */
export function parseQQAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set((env.VANTA_QQ_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** QQ is enabled when both app credentials are configured (id + secret). Pure. */
export function qqEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_QQ_APP_ID?.trim() && env.VANTA_QQ_APP_SECRET?.trim());
}
