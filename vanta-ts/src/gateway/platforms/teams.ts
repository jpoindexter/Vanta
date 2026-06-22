import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Microsoft Teams adapter — connects Vanta to Teams via the Azure Bot Framework Connector,
// same PlatformAdapter contract as Telegram/LINE/Matrix. Pure parse/build/allowlist fns are
// unit-tested offline; the live Bot Connector API is the injected transport boundary.
//
// Inbound = a Bot Framework Activity delivered to the bot's Azure webhook (NOT a poll).
// parseTeamsActivities accepts a single Activity, a bare array, or `{activities:[...]}`.
// conversation.id → chatId (a reply posts back to the same conversation); from.id → `from`
// (allowlist key); control-stripped text → text; id → id; a channel/groupChat/isGroup
// conversation → isGroup. Only a type:"message" Activity carrying text is routed (typing /
// conversationUpdate / card-only posts are skipped). serviceUrl is per-conversation and NOT
// in InboundMessage (base.ts off-limits), so the adapter records conversation.id → serviceUrl
// on poll and sends the reply to that recorded URI.
// Outbound: buildTeamsActivity(text) → POSTed to `${serviceUrl}/v3/conversations/{id}/activities`.
// Enable: VANTA_TEAMS_APP_ID + VANTA_TEAMS_APP_PASSWORD. Optional VANTA_TEAMS_ALLOWLIST (comma
// list, empty → allow all). The app password is read only into the injected transport
// (httpTransport, which mints+caches the app token) — never a literal here.

// Strip C0/C1 control chars (incl. ESC, DEL) from untrusted inbound text, but KEEP
// newline (\x0a) and tab (\x09) — both legitimate in a chat message and the agent input
// is multi-line. Defends against escape/control injection from a remote sender before the
// text reaches the agent.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

// The only Activity type that carries a routable chat message. A conversationUpdate /
// typing / messageReaction / installationUpdate activity carries no agent-facing text.
const MESSAGE_TYPE = "message";
// Teams conversationType values for a multi-user conversation (vs "personal" 1:1).
const GROUP_CONVERSATION_TYPES = new Set(["channel", "groupChat"]);

// One Bot Framework Activity as it arrives at the bot's messaging webhook. Tolerant:
// only the fields we route on are required; unknown extras (recipient, channelId,
// timestamp, channelData, …) are ignored by zod's default object parse. A non-message
// activity, or a message with no text, is dropped by the caller.
const TeamsActivity = z.object({
  type: z.string(),
  text: z.string().optional(),
  id: z.string().optional(),
  serviceUrl: z.string().optional(),
  conversation: z.object({
    id: z.string(),
    conversationType: z.string().optional(),
    isGroup: z.boolean().optional(),
  }),
  from: z.object({ id: z.string(), name: z.string().optional() }).optional(),
});

/**
 * Unwrap a Teams payload to its Activity array: a bare Activity object, a bare array,
 * OR an `{activities:[...]}` wrapper (some bridge buffers batch deliveries). Pure.
 */
function activitiesOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const list = (json as { activities?: unknown }).activities;
    if (Array.isArray(list)) return list;
    return [json]; // a single bare Activity
  }
  return [];
}

/** True when a conversation is multi-user (a Teams channel/group chat). Pure. */
function isGroupConversation(conv: { conversationType?: string; isGroup?: boolean }): boolean {
  if (conv.isGroup === true) return true;
  return conv.conversationType !== undefined && GROUP_CONVERSATION_TYPES.has(conv.conversationType);
}

/**
 * Parse a Bot Framework payload into inbound messages. Accepts a single Activity, a bare
 * array, OR an `{activities:[...]}` wrapper. Keeps only a `type:"message"` Activity that
 * carries text — non-message activities (conversationUpdate/typing/…) and text-less message
 * activities (card/attachment-only) are SKIPPED. Tolerant: any element that fails the shape
 * is dropped (garbage → []). Inbound text is control-stripped. Pure.
 *
 * Bot Framework's {conversation.id, from.id, text, id} map onto the shared `InboundMessage`
 * contract (`gateway/platforms/base.ts`, off-limits this round): conversation.id → chatId (the
 * conversation/routing key the reply POSTs back to), from.id → `from` (the sender, also the
 * allowlist key), text → text, id → id. A channel/groupChat conversation → isGroup. The
 * per-conversation serviceUrl is carried separately (see `parseServiceUrls` / the adapter).
 */
export function parseTeamsActivities(json: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  for (const raw of activitiesOf(json)) {
    const parsed = TeamsActivity.safeParse(raw);
    if (!parsed.success) continue;
    const a = parsed.data;
    if (a.type !== MESSAGE_TYPE) continue; // only a message activity carries routable text
    if (a.text === undefined) continue; // a card/attachment-only post has no agent text
    messages.push({
      chatId: a.conversation.id,
      from: a.from?.id,
      text: stripControl(a.text),
      ...(a.id !== undefined ? { id: a.id } : {}),
      isGroup: isGroupConversation(a.conversation),
    });
  }
  return messages;
}

/**
 * Extract the per-conversation `serviceUrl` map (conversation.id → serviceUrl) from a Teams
 * payload. The Bot Framework serviceUrl is per-conversation and is required to POST a reply,
 * but is NOT part of the shared InboundMessage — the adapter records it on each poll and the
 * transport sends to the recorded base URI. An activity with no serviceUrl is skipped. Pure.
 */
export function parseServiceUrls(json: unknown): Map<string, string> {
  const urls = new Map<string, string>();
  for (const raw of activitiesOf(json)) {
    const parsed = TeamsActivity.safeParse(raw);
    if (!parsed.success) continue;
    const a = parsed.data;
    if (a.serviceUrl !== undefined) urls.set(a.conversation.id, a.serviceUrl);
  }
  return urls;
}

// Teams renders a message well above any chat reply; split at a generous char budget so a
// long agent reply is SENT AS MULTIPLE activities rather than truncated or rejected.
const TEAMS_TEXT_LIMIT = 28000;

/**
 * Build the reply Activity body for POST /v3/conversations/{conversationId}/activities:
 * {type:"message", text}. The text is control-stripped (the agent's reply is trusted, but the
 * strip keeps outbound bytes clean and matches inbound handling) and capped at the per-message
 * budget (the caller splits a long reply first; this is the per-message hard cap). Pure.
 */
export function buildTeamsActivity(text: string): { type: "message"; text: string } {
  return { type: MESSAGE_TYPE, text: stripControl(text).slice(0, TEAMS_TEXT_LIMIT) };
}

/**
 * Parse the VANTA_TEAMS_ALLOWLIST conversation/user-id allowlist (comma list). Empty/absent →
 * an empty set, which the adapter treats as "allow all". Pure.
 */
export function parseTeamsAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_TEAMS_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Teams is enabled only when BOTH the bot's app id and app password are configured — one
 * without the other can neither mint a token nor send. Pure.
 */
export function teamsEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.VANTA_TEAMS_APP_ID &&
      env.VANTA_TEAMS_APP_ID.trim() &&
      env.VANTA_TEAMS_APP_PASSWORD &&
      env.VANTA_TEAMS_APP_PASSWORD.trim(),
  );
}

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
  // conversation.id → serviceUrl, recorded on every poll (Bot Framework serviceUrl is
  // per-conversation), so send() can POST the reply to the right base URI.
  private readonly serviceUrls = new Map<string, string>();

  constructor(opts: { transport: TeamsTransport; allow?: Set<string> }) {
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
    // Record each conversation's serviceUrl so a later send routes to the right base URI.
    for (const [convId, url] of parseServiceUrls(json)) this.serviceUrls.set(convId, url);
    const messages = parseTeamsActivities(json);
    if (this.allow.size === 0) return messages;
    // Allow a message whose conversation (chatId) OR sender (from) is listed — the
    // allowlist accepts both conversation and user ids.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // No recorded serviceUrl for this conversation → we never saw an inbound activity for it,
    // so there is no base URI to reply to. Drop rather than throw (errors-as-values).
    const serviceUrl = this.serviceUrls.get(msg.chatId);
    if (serviceUrl === undefined) return;
    // Teams renders plain text in a basic activity (no markdown parse), so degrade the agent's
    // markdown to readable plain text, then split to the budget and POST each part.
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, TEAMS_TEXT_LIMIT, "chars")) {
      await this.transport.send(serviceUrl, msg.chatId, buildTeamsActivity(part)).catch(() => {
        /* errors-as-values: a send failure must not throw through the gateway loop */
      });
    }
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
      if (token === undefined) return; // no token → cannot authenticate; drop (caller catches)
      const base = serviceUrl.replace(/\/+$/, "");
      await fetch(`${base}/v3/conversations/${encodeURIComponent(conversationId)}/activities`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(activity),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
