import { z } from "zod";
import type {
  InboundMessage,
  OutboundDeliveryReceipt,
  OutboundMessage,
  PlatformAdapter,
  PlatformWebhookHandler,
} from "./base.js";
import type { TeamsActivityVerifier } from "./teams-auth.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import {
  buildTeamsActivity,
  parseServiceUrls,
  parseTeamsActivities,
  TEAMS_TEXT_LIMIT,
} from "./teams-parse.js";

// Microsoft Teams adapter — connects Vanta to Teams via the Azure Bot Framework Connector,
// same PlatformAdapter contract as Telegram/LINE/Matrix. The pure parse/build/allowlist fns
// live in `teams-parse.ts` (offline-unit-tested) and are re-exported below so the public
// module path (`./teams.js`) is unchanged; the live Bot Connector API is the injected
// transport boundary.
//
// Enable: VANTA_TEAMS_APP_ID + VANTA_TEAMS_APP_PASSWORD. Optional VANTA_TEAMS_ALLOWLIST (comma
// list, empty → allow all). The app password is read only into the injected transport
// (httpTransport, which mints+caches the app token) — never a literal here.

// Re-export the pure helpers so importers of `./teams.js` see an unchanged surface.
export {
  stripControl,
  parseTeamsActivities,
  parseServiceUrls,
  buildTeamsActivity,
  parseTeamsAllowlist,
  teamsEnabled,
} from "./teams-parse.js";

/**
 * The injected Teams transport — the documented live boundary. `poll` pulls new activities
 * (the Azure bot webhook event source); `send` POSTs one reply activity to a conversation,
 * keyed by its per-conversation `serviceUrl` (the base URI) + conversationId. Both carry the
 * app token internally (see `httpTransport` below, the ONLY place the secret is read — it mints
 * + caches the app token there). Tests pass a fake transport so no real network — and no
 * secret — is touched.
 */
export type TeamsTransport = {
  poll: () => Promise<unknown>;
  send: (serviceUrl: string, conversationId: string, activity: unknown) => Promise<void>;
};

export class TeamsAdapter implements PlatformAdapter {
  readonly id = "teams";
  private readonly transport: TeamsTransport;
  private readonly allow: Set<string>;
  private readonly verifyActivity?: TeamsActivityVerifier;
  private readonly pending: unknown[] = [];
  // conversation.id → serviceUrl, recorded on every poll (Bot Framework serviceUrl is
  // per-conversation), so send() can POST the reply to the right base URI.
  private readonly serviceUrls = new Map<string, string>();

  constructor(opts: { transport: TeamsTransport; allow?: Set<string>; verifyActivity?: TeamsActivityVerifier }) {
    this.transport = opts.transport;
    this.allow = opts.allow ?? new Set();
    this.verifyActivity = opts.verifyActivity;
  }

  async connect(): Promise<void> {
    /* stateless REST via the injected transport — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down */
  }

  async poll(): Promise<InboundMessage[]> {
    const pushed = this.pending.splice(0);
    const pulled = await this.transport.poll().catch(() => undefined);
    const payloads = pulled === undefined ? pushed : [...pushed, pulled];
    // Record each conversation's serviceUrl so a later send routes to the right base URI.
    const messages: InboundMessage[] = [];
    for (const payload of payloads) {
      for (const [convId, url] of parseServiceUrls(payload)) this.serviceUrls.set(convId, url);
      messages.push(...parseTeamsActivities(payload));
    }
    if (this.allow.size === 0) return messages;
    // Allow a message whose conversation (chatId) OR sender (from) is listed — the
    // allowlist accepts both conversation and user ids.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<OutboundDeliveryReceipt | undefined> {
    // No recorded serviceUrl for this conversation → we never saw an inbound activity for it,
    // so there is no base URI to reply to. Drop rather than throw (errors-as-values).
    const serviceUrl = this.serviceUrls.get(msg.chatId);
    if (serviceUrl === undefined) return undefined;
    // Teams renders plain text in a basic activity (no markdown parse), so degrade the agent's
    // markdown to readable plain text, then split to the budget and POST each part.
    const formatted = formatForDialect(msg.text, "plain");
    let parts = 0;
    for (const part of splitForLimit(formatted, TEAMS_TEXT_LIMIT, "chars")) {
      try {
        await this.transport.send(serviceUrl, msg.chatId, buildTeamsActivity(part));
        parts += 1;
      } catch {
        return undefined;
      }
    }
    return parts > 0
      ? { platform: "teams", transport: "bot-connector", accepted: true, parts }
      : undefined;
  }

  webhookHandlers(): PlatformWebhookHandler[] {
    if (!this.verifyActivity) return [];
    return [{
      path: "/api/messages",
      receive: async ({ body, headers }) => {
        let activity: unknown;
        try { activity = JSON.parse(body); }
        catch { return { status: 400, body: "invalid json" }; }
        const authorization = headers.authorization;
        const header = Array.isArray(authorization) ? authorization[0] : authorization;
        if (!(await this.verifyActivity!(header, activity))) return { status: 401, body: "unauthorized" };
        this.pending.push(activity);
        return { status: 202, body: "accepted" };
      },
    }];
  }
}

// The Bot Framework login service — mints the app (service-to-service) token.
const TOKEN_URL = "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";
// The OAuth scope for the Bot Connector API (client_credentials flow).
const CONNECTOR_SCOPE = "https://api.botframework.com/.default";
// Refresh the cached token this many ms before its stated expiry (clock-skew margin).
const TOKEN_SKEW_MS = 60_000;

const TokenResponse = z.object({ access_token: z.string(), expires_in: z.number() });

/** A minted app token plus the epoch-ms at which it should be considered expired. */
type CachedToken = { token: string; expiresAt: number };

/**
 * Build the live Teams (Bot Connector) transport. THE WIRE: the app password (a secret) is
 * read ONLY here, into the client_credentials token request — never stored on the adapter and
 * never a literal elsewhere. The minted app token is cached and reused until ~1min before its
 * expiry, then re-minted. `poll`/`send` are errors-tolerant at the call site (poll catches in
 * the adapter; send catches). Bot Framework has no inbound poll endpoint (activities arrive at
 * the Azure messaging webhook), so `poll` is supplied by the caller's webhook buffer in live
 * use; the default here returns no activities. Live use needs a real bot app id + password.
 */
export function httpTransport(appId: string, appPassword: string): TeamsTransport {
  let cached: CachedToken | undefined;

  const mintToken = async (): Promise<string | undefined> => {
    const now = Date.now();
    if (cached && cached.expiresAt - TOKEN_SKEW_MS > now) return cached.token;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: appPassword,
      scope: CONNECTOR_SCOPE,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const parsed = TokenResponse.safeParse(await res.json());
    if (!parsed.success) return undefined;
    cached = { token: parsed.data.access_token, expiresAt: now + parsed.data.expires_in * 1000 };
    return cached.token;
  };

  return {
    poll: async () => undefined, // inbound arrives via the Azure bot webhook, not a poll endpoint
    send: async (serviceUrl, conversationId, activity) => {
      const token = await mintToken();
      if (token === undefined) throw new Error("Teams Connector token unavailable");
      const base = serviceUrl.replace(/\/+$/, "");
      const response = await fetch(`${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(activity),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Teams Connector returned HTTP ${response.status}`);
    },
  };
}
