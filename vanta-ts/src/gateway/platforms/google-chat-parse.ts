import { createSign } from "node:crypto";
import { z } from "zod";
import type { InboundMessage } from "./base.js";

// Google Chat — pure helpers: inbound event parse, outbound body build, allowlist +
// enable checks, and the service-account JWT assertion builder. Sibling to
// google-chat.ts (the stateful adapter + live transport), which imports + re-exports
// these so the module's public surface (registry + tests) is unchanged.

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

// The only event type that carries a routable chat message. ADDED_TO_SPACE,
// REMOVED_FROM_SPACE, CARD_CLICKED, etc. carry no agent-facing text and are skipped.
const MESSAGE_EVENT = "MESSAGE";
// A sender whose type is BOT is a bot (Vanta itself or another bot) — never routed.
const BOT_SENDER = "BOT";

// One Google Chat event as it arrives from the bot endpoint. Tolerant: only the fields we
// route on are required; unknown extras are ignored by zod's default object parse. A
// non-MESSAGE event (or any malformed payload) fails this shape and is dropped.
const GoogleChatEvent = z.object({
  type: z.string(),
  message: z.object({
    name: z.string(),
    text: z.string(),
    sender: z.object({ name: z.string(), type: z.string().optional() }),
    space: z.object({ name: z.string() }),
  }),
});

/**
 * Parse a Google Chat events payload (an array of events) into inbound messages. Skips any
 * "BOT"-sent event (anti-loop: never reply to itself/another bot) and any non-"MESSAGE" type
 * (ADDED_TO_SPACE / CARD_CLICKED / … carry no agent text). Tolerant: a non-array, or any element
 * failing the MESSAGE shape, is dropped (garbage → []). Inbound text is control-stripped. Pure.
 * Maps onto the shared `InboundMessage` contract: message.space.name → chatId (routing key),
 * message.sender.name → `from` (allowlist key), message.text → text, message.name → id, isGroup.
 */
export function parseGoogleChatEvents(json: unknown): InboundMessage[] {
  if (!Array.isArray(json)) return [];
  const messages: InboundMessage[] = [];
  for (const raw of json) {
    const parsed = GoogleChatEvent.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.type !== MESSAGE_EVENT) continue; // only a MESSAGE event carries routable text
    if (e.message.sender.type === BOT_SENDER) continue; // anti-loop: never route bot messages
    messages.push({
      chatId: e.message.space.name,
      from: e.message.sender.name,
      text: stripControl(e.message.text),
      id: e.message.name,
      isGroup: true, // a Google Chat space is multi-user by nature
    });
  }
  return messages;
}

/**
 * Build the send body for spaces.messages.create. A Google Chat text message is {text}; the
 * text is control-stripped (the agent's reply is trusted, but the strip keeps outbound bytes
 * clean and matches inbound handling). Pure.
 */
export function buildGoogleChatSend(text: string): { text: string } {
  return { text: stripControl(text) };
}

/**
 * Parse the VANTA_GOOGLE_CHAT_ALLOWLIST space/sender-name allowlist (comma list).
 * Empty/absent → an empty set, which the adapter treats as "allow all". Pure.
 */
export function parseGoogleChatAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_GOOGLE_CHAT_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Google Chat is enabled when a service-account is configured (VANTA_GOOGLECHAT_SA — the SA
 * JSON, holding `client_email` + the PEM `private_key`). The adapter mints + caches a Chat-bot
 * bearer token from it internally (see `serviceAccountTransport`); the SA's private key is a
 * SECRET, read only inside that minting boundary, never logged or stored on the adapter. Pure.
 */
export function googleChatEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_GOOGLECHAT_SA && env.VANTA_GOOGLECHAT_SA.trim());
}

// Service-account → Chat-bot bearer minting (JWT-bearer grant, RFC 7523). The SA's PEM private
// key is read ONLY inside buildServiceAccountJwt (sign the JWT) — never logged, never on the adapter.
const CHAT_BOT_SCOPE = "https://www.googleapis.com/auth/chat.bot"; // minted token can only act as a Chat bot
// JWT `aud` + token-exchange POST target; google-chat.ts reuses it as the mint URL default.
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_TTL_SEC = 3600; // Google caps `exp` at iat + 1h — the documented max

// A parsed service-account key — only the fields the JWT-bearer flow reads (`private_key` is the
// PEM secret; `token_uri` overrides the default token endpoint when the SA JSON carries it).
export const ServiceAccount = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.string().optional(),
});
export type ServiceAccount = z.infer<typeof ServiceAccount>;

const b64url = (input: string): string => Buffer.from(input, "utf8").toString("base64url");

/**
 * Build + RS256-sign a Google service-account JWT assertion. Header `{alg:"RS256", typ:"JWT"}`,
 * claims `{iss:client_email, scope:chat.bot, aud:token endpoint, iat:nowSec, exp:nowSec+1h}`;
 * `header.claims` is signed with the SA's PEM `private_key` via node:crypto `RSA-SHA256`. Pure.
 */
export function buildServiceAccountJwt(sa: ServiceAccount, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: CHAT_BOT_SCOPE,
      aud: sa.token_uri ?? GOOGLE_TOKEN_URL,
      iat: nowSec,
      exp: nowSec + JWT_TTL_SEC,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(sa.private_key, "base64url");
  return `${signingInput}.${signature}`;
}
