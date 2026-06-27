import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import {
  buildGoogleChatSend,
  buildServiceAccountJwt,
  GOOGLE_TOKEN_URL,
  parseGoogleChatEvents,
  ServiceAccount,
} from "./google-chat-parse.js";

// Google Chat adapter — connects Vanta to Google Chat as a messaging channel on the shared
// PlatformAdapter contract (like Telegram/Discord/Matrix). The live Chat API (a bot/event
// source for inbound + a spaces.messages.create POST for outbound) is the injected boundary:
// the pure parse/build/allowlist fns (./google-chat-parse.js, re-exported below) are unit-tested
// offline; the transport ({poll, postMessage}) is supplied by the caller.
//
// Enable: VANTA_GOOGLECHAT_SA present (the service-account JSON — `client_email` + the PEM
//   `private_key`). The adapter mints + caches a Chat-bot bearer token from it internally via
//   `serviceAccountTransport`; the SA's private key is a SECRET, read only in that minting
//   boundary, never logged or stored on the adapter. `httpTransport(token)` (an already-minted
//   bearer) stays for callers that supply their own token. Optional VANTA_GOOGLE_CHAT_ALLOWLIST
//   = comma list of space/sender names to accept (empty → allow all).

// Re-export the pure helpers so this module's public surface (used by the registry + tests)
// is unchanged after the parse/adapter split.
export {
  stripControl,
  parseGoogleChatEvents,
  buildGoogleChatSend,
  parseGoogleChatAllowlist,
  googleChatEnabled,
  buildServiceAccountJwt,
} from "./google-chat-parse.js";
export type { ServiceAccount } from "./google-chat-parse.js";

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

// Service-account → Chat-bot bearer minting (JWT-bearer grant, RFC 7523). The signed JWT is
// built in `buildServiceAccountJwt` (./google-chat-parse.js — the only place the PEM key is read).
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const TOKEN_REFRESH_SKEW_SEC = 60; // re-mint a touch early so no in-flight request carries a just-expired token

const nowSecEpoch = (): number => Math.floor(Date.now() / 1000);

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
