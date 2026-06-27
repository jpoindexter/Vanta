import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import { buildMatrixSendContent, parseMatrixEvents } from "./matrix-parse.js";

// Re-export the pure parse/build/allowlist/enable helpers so importers keep the same
// module path (`./matrix.js`). Their implementation lives in `matrix-parse.ts`.
export {
  stripControl,
  parseMatrixEvents,
  buildMatrixSendContent,
  parseMatrixAllowlist,
  matrixEnabled,
} from "./matrix-parse.js";

// Matrix adapter — connects Vanta to a Matrix homeserver as a messaging channel,
// implementing the same PlatformAdapter contract as Telegram/Discord/Email so the
// gateway treats Matrix like any other channel. The live Matrix client-server API
// (a `/sync` long-poll for inbound + a PUT-to-send for outbound) is the injected
// boundary: the pure parse/build/allowlist fns (in `matrix-parse.ts`) are unit-tested
// offline; the transport ({sync, sendEvent}) is supplied by the caller (real homeserver live).
//
// Inbound shape (a Matrix `m.room.message` timeline event):
//   {event_id, sender, room_id, content:{msgtype, body}}.
//   parse → InboundMessage[]. The room_id IS the conversation key (chatId), so a reply
//   threads back to the same room; sender → `from` (also the allowlist key); body is
//   control-stripped → text; event_id → id. A Matrix room is multi-user → isGroup.
//   SELF-SENT events (sender === selfUserId) are SKIPPED so the bot never replies to its
//   own messages echoed back through /sync — the anti-loop guard. Non-text msgtypes
//   (m.image/m.file/…) are SKIPPED — only `m.text` is routed to the agent.
// Outbound: buildMatrixSendContent(text) → {msgtype:"m.text", body}; the adapter PUTs it
//   to /rooms/<room>/send/m.room.message via the injected transport.
// Enable: VANTA_MATRIX_HOMESERVER AND VANTA_MATRIX_TOKEN present. Optional
//   VANTA_MATRIX_ALLOWLIST = comma list of room/user ids to accept (empty → allow all).
//   The access token is a SECRET: it is only ever read into the injected transport at the
//   wire (named below), never a literal in this file.

// Matrix caps an event body well above any chat reply; split at a generous char budget
// so a long agent reply is SENT AS MULTIPLE events rather than truncated or rejected.
const MATRIX_BODY_LIMIT = 30000;

/**
 * The injected Matrix transport — the documented live boundary. `sync` pulls new
 * timeline events (the /sync poll source); `sendEvent` PUTs one message event to a room.
 * Both carry the access token internally (see `httpTransport` below, the ONLY place the
 * secret is read). Tests pass a fake transport so no real network — and no secret — is
 * touched.
 */
export type MatrixTransport = {
  sync: () => Promise<unknown>;
  sendEvent: (roomId: string, content: unknown) => Promise<void>;
};

export class MatrixAdapter implements PlatformAdapter {
  readonly id = "matrix";
  private readonly transport: MatrixTransport;
  private readonly selfUserId?: string;
  private readonly allow: Set<string>;

  constructor(opts: { transport: MatrixTransport; selfUserId?: string; allow?: Set<string> }) {
    this.transport = opts.transport;
    this.selfUserId = opts.selfUserId;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    /* stateless client-server REST via the injected transport — nothing to set up */
  }
  async disconnect(): Promise<void> {
    /* nothing to tear down — the transport owns its sync state */
  }

  async poll(): Promise<InboundMessage[]> {
    const json = await this.transport.sync().catch(() => undefined);
    const messages = parseMatrixEvents(json, this.selfUserId);
    if (this.allow.size === 0) return messages;
    // Allow a message whose room (chatId) OR sender (from) is listed — the allowlist
    // accepts both room and user ids.
    return messages.filter((m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)));
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Matrix renders markdown only with formatted_body; a plain m.text body is read
    // literally, so degrade markdown to readable plain text, then split to the body
    // budget and send each part as its own event.
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, MATRIX_BODY_LIMIT, "chars")) {
      await this.transport.sendEvent(msg.chatId, buildMatrixSendContent(part)).catch(() => {
        /* errors-as-values: a send failure must not throw through the gateway loop */
      });
    }
  }
}

/**
 * Build the live Matrix client-server transport. THE WIRE: the access token (a secret)
 * is read ONLY here, into the `Authorization: Bearer <token>` header — never stored on
 * the adapter and never a literal in this file. `sync`/`sendEvent` are errors-tolerant
 * at the call site (poll catches; send catches). Live use needs a real token against a
 * real homeserver.
 */
export function httpTransport(homeserver: string, token: string): MatrixTransport {
  const base = homeserver.replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    sync: async () => {
      const res = await fetch(`${base}/_matrix/client/v3/sync`, {
        headers: auth,
        signal: AbortSignal.timeout(35000),
      });
      return res.ok ? res.json() : undefined;
    },
    sendEvent: async (roomId, content) => {
      const txnId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await fetch(
        `${base}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        {
          method: "PUT",
          headers: auth,
          body: JSON.stringify(content),
          signal: AbortSignal.timeout(5000),
        },
      );
    },
  };
}
