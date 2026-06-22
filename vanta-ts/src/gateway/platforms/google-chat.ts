import { createSign } from "node:crypto";
import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Google Chat adapter — connects Vanta to Google Chat as a messaging channel on the shared
// PlatformAdapter contract (like Telegram/Discord/Matrix). The live Chat API (a bot/event
// source for inbound + a spaces.messages.create POST for outbound) is the injected boundary:
// the pure parse/build/allowlist fns are unit-tested offline; the transport ({poll,
// postMessage}) is supplied by the caller. Per-fn docstrings carry the event/body shapes.
//
// Enable: VANTA_GOOGLECHAT_SA present (the service-account JSON — `client_email` + the PEM
//   `private_key`). The adapter mints + caches a Chat-bot bearer token from it internally via
//   `serviceAccountTransport`; the SA's private key is a SECRET, read only in that minting
//   boundary, never logged or stored on the adapter. `httpTransport(token)` (an already-minted
//   bearer) stays for callers that supply their own token. Optional VANTA_GOOGLE_CHAT_ALLOWLIST
//   = comma list of space/sender names to accept (empty → allow all).

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

// Google Chat caps a message's text well above any chat reply; split at a generous char
// budget so a long agent reply is SENT AS MULTIPLE messages rather than truncated or rejected.
const GOOGLE_CHAT_TEXT_LIMIT = 4000;

/**
 * The injected Google Chat transport — the documented live boundary. `poll` pulls new events
 * (the bot/event source); `postMessage` POSTs one message to a space. Both carry the bearer
 * token internally (see `httpTransport` below, the ONLY place the secret is read). Tests pass a
 * fake transport so no real network — and no secret — is touched.
 */
export type GoogleChatTransport = {
  poll: () => Promise<unknown>;
  postMessage: (space: string, body: unknown) => Promise<void>;
};

export class GoogleChatAdapter implements PlatformAdapter {
  readonly id = "googlechat";
  private readonly transport: GoogleChatTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: GoogleChatTransport; allow?: Set<string> }) {
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
    const messages = parseGoogleChatEvents(json);
    if (this.allow.size === 0) return messages;
    // Allow a message whose space (chatId) OR sender (from) is listed — the allowlist
    // accepts both space and sender names.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Google Chat renders its own lightweight markup, not standard markdown; degrade the
    // agent's markdown to readable plain text, then split to the budget and send each part.
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, GOOGLE_CHAT_TEXT_LIMIT, "chars")) {
      await this.transport.postMessage(msg.chatId, buildGoogleChatSend(part)).catch(() => {
        /* errors-as-values: a send failure must not throw through the gateway loop */
      });
    }
  }
}

// Google Chat REST API base — the injected transport joins this with the per-call path.
const GOOGLE_CHAT_API_BASE = "https://chat.googleapis.com/v1";

/**
 * Build the live Google Chat REST transport from an already-minted bearer token. THE WIRE: the
 * token (a secret) is read ONLY here, into the `Authorization: Bearer <token>` header — never
 * stored on the adapter, never a literal. `serviceAccountTransport` below mints + caches the
 * token from a service account; this fn is the lower wire for callers that supply their own.
 */
export function httpTransport(token: string, apiBase?: string): GoogleChatTransport {
  const base = (apiBase ?? GOOGLE_CHAT_API_BASE).replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    poll: async () => {
      const res = await fetch(`${base}/spaces/-/messages`, {
        headers: auth,
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? res.json() : undefined;
    },
    postMessage: async (space, body) => {
      await fetch(`${base}/${space}/messages`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}

// Service-account → Chat-bot bearer minting (JWT-bearer grant, RFC 7523). The SA's PEM private
// key is read ONLY inside this block (sign the JWT) — never logged, never on the adapter.
const CHAT_BOT_SCOPE = "https://www.googleapis.com/auth/chat.bot"; // minted token can only act as a Chat bot
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"; // JWT `aud` + token-exchange POST target
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const JWT_TTL_SEC = 3600; // Google caps `exp` at iat + 1h — the documented max
const TOKEN_REFRESH_SKEW_SEC = 60; // re-mint a touch early so no in-flight request carries a just-expired token

// A parsed service-account key — only the fields the JWT-bearer flow reads (`private_key` is the
// PEM secret; `token_uri` overrides the default token endpoint when the SA JSON carries it).
const ServiceAccount = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.string().optional(),
});
export type ServiceAccount = z.infer<typeof ServiceAccount>;

const b64url = (input: string): string => Buffer.from(input, "utf8").toString("base64url");
const nowSecEpoch = (): number => Math.floor(Date.now() / 1000);

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

type CachedToken = { token: string; refreshAt: number }; // token + epoch-sec to refresh at (before expiry)

/**
 * Exchange a service-account JWT at Google's token endpoint for a Chat-bot access_token (the
 * form-encoded `jwt-bearer` grant); returns the token + when to refresh it (`expires_in` − skew).
 * Throws on a non-OK exchange — the caller treats a mint failure as errors-as-values.
 */
async function mintToken(sa: ServiceAccount): Promise<CachedToken> {
  const issuedAt = nowSecEpoch();
  const assertion = buildServiceAccountJwt(sa, issuedAt);
  const res = await fetch(sa.token_uri ?? GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }).toString(),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`google chat token exchange failed: ${res.status}`);
  const body = z.object({ access_token: z.string().min(1), expires_in: z.number() }).parse(await res.json());
  return { token: body.access_token, refreshAt: issuedAt + body.expires_in - TOKEN_REFRESH_SKEW_SEC };
}

/**
 * A token provider that mints once and reuses the cached token until ~expiry, then re-mints. The
 * SA is captured in the closure (the only place the private key lives); the fn does the network
 * on a cache miss and hands callers only the short-lived bearer token.
 */
function tokenProvider(sa: ServiceAccount): () => Promise<string> {
  let cached: CachedToken | undefined;
  return async () => {
    if (cached && nowSecEpoch() < cached.refreshAt) return cached.token;
    cached = await mintToken(sa);
    return cached.token;
  };
}

/** Parse JSON, undefined (not throwing) on garbage — keeps the SA parse errors-as-values. */
function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

/**
 * Build the live Google Chat transport from ONLY the service-account JSON (VANTA_GOOGLECHAT_SA).
 * Parses the SA, mints + caches a Chat-bot bearer token internally, and threads a fresh token
 * through the `httpTransport` wire per call. THE SECRET BOUNDARY: the SA's private key is read
 * only here + in the minting closure (never on the adapter, never logged). Errors-as-values: an
 * unparseable SA or a failed mint makes `poll` return undefined (→ []) and `postMessage` a no-op.
 */
export function serviceAccountTransport(saJson: string, apiBase?: string): GoogleChatTransport {
  const parsed = ServiceAccount.safeParse(safeJson(saJson));
  const getToken = parsed.success ? tokenProvider(parsed.data) : undefined;
  const withToken = async <T>(use: (t: GoogleChatTransport) => Promise<T>, fallback: T): Promise<T> => {
    if (!getToken) return fallback;
    try {
      return await use(httpTransport(await getToken(), apiBase));
    } catch {
      return fallback; // mint/parse/network failure → errors-as-values
    }
  };
  return {
    poll: () => withToken((t) => t.poll(), undefined),
    postMessage: (space, body) => withToken((t) => t.postMessage(space, body), undefined),
  };
}
