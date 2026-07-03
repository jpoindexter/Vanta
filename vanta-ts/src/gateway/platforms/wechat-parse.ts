import type { InboundMessage } from "./base.js";

// WeChat Official Account (微信公众号) — pure helpers: inbound message-XML parse, outbound
// custom-message body build, allowlist + enable checks, per-message cap. Sibling to wechat.ts
// (the adapter + live REST transport that mints the access_token). No secret here.
//
// WIRE FORMAT (inbound doc-confirmed): a 公众号 delivers an inbound message as a flat XML POST
// to its server URL. A text message is:
//   <xml><ToUserName><![CDATA[..]]></ToUserName><FromUserName><![CDATA[openid]]></FromUserName>
//   <CreateTime>..</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[..]]></Content>
//   <MsgId>..</MsgId></xml>
//   FromUserName (the user's openid) → chatId + from (reply routes back via custom/send);
//   Content → text; MsgId → id. 公众号 chats are 1:1 (isGroup:false). Non-text MsgTypes skip.
// Outbound (doc): POST /cgi-bin/message/custom/send?access_token=<t> body
//   {touser, msgtype:"text", text:{content}} — valid inside the 48h customer-service window.

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip C0/C1 control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

/** Extract a flat WeChat XML element's text, unwrapping an optional CDATA. Pure. */
export function xmlTag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${name}>`));
  if (!m) return undefined;
  return (m[1] ?? m[2] ?? "").trim();
}

const TEXT_MSG = "text";

/**
 * Parse one WeChat inbound message XML into an InboundMessage. Only a text message carries
 * routable agent text; other MsgTypes (image/voice/event/…) or a missing sender/content → null.
 * Tolerant: a non-XML string → null. Pure.
 */
export function parseWeChatMessage(xml: string): InboundMessage | null {
  if (typeof xml !== "string" || !xml.includes("<xml")) return null;
  if (xmlTag(xml, "MsgType") !== TEXT_MSG) return null;
  const from = xmlTag(xml, "FromUserName");
  const content = xmlTag(xml, "Content");
  if (!from || !content) return null;
  return { chatId: from, from, text: stripControl(content), id: xmlTag(xml, "MsgId"), isGroup: false };
}

/**
 * Parse a WeChat webhook payload (one XML string, or an array of them from the buffer) into
 * inbound messages. Non-string / non-text elements are dropped. Pure.
 */
export function parseWeChatEvents(json: unknown): InboundMessage[] {
  const items = Array.isArray(json) ? json : json ? [json] : [];
  const out: InboundMessage[] = [];
  for (const it of items) {
    if (typeof it !== "string") continue;
    const m = parseWeChatMessage(it);
    if (m) out.push(m);
  }
  return out;
}

// 公众号 custom text messages cap at 2048 bytes; the split budget is a defensive backstop.
export const WECHAT_TEXT_LIMIT = 2048;

export type WeChatMessageBody = { touser: string; msgtype: "text"; text: { content: string } };

/** Build a custom-service text body: {touser, msgtype:"text", text:{content}}. Pure. */
export function buildWeChatMessage(chatId: string, text: string): WeChatMessageBody {
  return { touser: chatId, msgtype: "text", text: { content: stripControl(text).slice(0, WECHAT_TEXT_LIMIT) } };
}

/** Parse VANTA_WECHAT_ALLOWLIST (comma list of openids). Empty → allow all. Pure. */
export function parseWeChatAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set((env.VANTA_WECHAT_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** WeChat is enabled when both app credentials are configured (appid + secret). Pure. */
export function wechatEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_WECHAT_APP_ID?.trim() && env.VANTA_WECHAT_APP_SECRET?.trim());
}
