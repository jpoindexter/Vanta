import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { buildLinePushBody, LINE_TEXT_LIMIT, parseLineEvents } from "./line-parse.js";

// Re-export the pure parse/build/allowlist helpers so the public module path is unchanged —
// adapter-registry.ts, webchat.ts, and line.test.ts import them from "./line.js".
export {
  buildLinePushBody,
  lineEnabled,
  parseLineAllowlist,
  parseLineEvents,
  stripControl,
} from "./line-parse.js";

// LINE adapter — connects Vanta to the LINE Messaging API as a messaging channel,
// implementing the same PlatformAdapter contract as Telegram/Discord/Matrix/Google Chat
// so the gateway treats it like any other channel. The live LINE API (a webhook event
// source for inbound + a /v2/bot/message/push POST for outbound) is the injected boundary:
// the pure parse/build/allowlist fns (in `line-parse.ts`) are unit-tested offline; the
// transport ({poll, push}) is supplied by the caller (a real LINE channel live).
//
// Outbound: buildLinePushBody(chatId, text) → the adapter PUSHes it via the injected transport,
//   keyed by chatId (the source id). The token is a SECRET: only ever read into the injected
//   transport at the wire (httpTransport below), never a literal in this file.

/**
 * The injected LINE transport — the documented live boundary. `poll` pulls new webhook events
 * (the webhook event source); `push` POSTs one push body to the LINE API. Both carry the
 * channel access token internally (see `httpTransport` below, the ONLY place the secret is
 * read). Tests pass a fake transport so no real network — and no secret — is touched.
 */
export type LineTransport = {
  poll: () => Promise<unknown>;
  push: (body: unknown) => Promise<void>;
};

export class LineAdapter implements PlatformAdapter {
  readonly id = "line";
  private readonly transport: LineTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: LineTransport; allow?: Set<string> }) {
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
    const messages = parseLineEvents(json);
    if (this.allow.size === 0) return messages;
    // Allow a message whose conversation (chatId) OR sender (from) is listed — the
    // allowlist accepts both user/group ids.
    return messages.filter(
      (m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)),
    );
  }

  async send(msg: OutboundMessage): Promise<void> {
    // LINE renders plain text (no markdown), so degrade the agent's markdown to readable
    // plain text, then split to the budget and PUSH each part keyed by chatId (the source id).
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, LINE_TEXT_LIMIT, "chars")) {
      await this.transport.push(buildLinePushBody(msg.chatId, part)).catch(() => {
        /* errors-as-values: a push failure must not throw through the gateway loop */
      });
    }
  }
}

// LINE Messaging API base — the injected transport joins this with the per-call path.
const LINE_API_BASE = "https://api.line.me";

/**
 * Build the live LINE REST transport. THE WIRE: the channel access token (a secret) is read
 * ONLY here, into the `Authorization: Bearer <token>` header — never stored on the adapter and
 * never a literal in this file. `poll`/`push` are errors-tolerant at the call site (poll
 * catches; the gateway loop never throws). LINE has no inbound poll endpoint (events arrive via
 * the channel webhook), so `poll` is supplied by the caller's webhook buffer in live use; the
 * default here returns no events. Live use needs a real channel access token.
 */
export function httpTransport(token: string, apiBase?: string): LineTransport {
  const base = (apiBase ?? LINE_API_BASE).replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    poll: async () => undefined, // inbound arrives via the channel webhook, not a poll endpoint
    push: async (body) => {
      await fetch(`${base}/v2/bot/message/push`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
