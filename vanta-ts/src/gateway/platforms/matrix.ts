import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Matrix adapter — connects Vanta to a Matrix homeserver as a messaging channel,
// implementing the same PlatformAdapter contract as Telegram/Discord/Email so the
// gateway treats Matrix like any other channel. The live Matrix client-server API
// (a `/sync` long-poll for inbound + a PUT-to-send for outbound) is the injected
// boundary: the pure parse/build/allowlist fns are unit-tested offline; the
// transport ({sync, sendEvent}) is supplied by the caller (real homeserver live).
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

// The msgtype the agent reads + sends. Only `m.text` is a routable chat message; other
// msgtypes (m.image/m.file/m.audio/…) carry no agent-facing body and are skipped.
const TEXT_MSGTYPE = "m.text";

// One Matrix timeline event as it arrives from a `/sync` response or a room's timeline.
// Tolerant: only the fields we route on are required; unknown extras are ignored by
// zod's default object parse. Non-message events fail this shape and are dropped.
const MatrixEvent = z.object({
  event_id: z.string(),
  sender: z.string(),
  room_id: z.string(),
  content: z.object({ msgtype: z.string(), body: z.string() }),
});

/**
 * Parse a Matrix sync/timeline payload (an array of timeline events) into inbound
 * messages. Skips events sent by `selfUserId` (the bot's own messages echoed back
 * through /sync) so the bot never replies to itself — the anti-loop guard. Skips any
 * event whose msgtype is not `m.text` (m.image/m.file/… carry no agent text). Tolerant:
 * a non-array, or any element that fails the `m.room.message` shape, is dropped
 * (garbage → []). Inbound text is control-stripped. Pure.
 *
 * Matrix's {room_id, sender, content.body} map onto the shared `InboundMessage`
 * contract (`gateway/platforms/base.ts`, off-limits this round): room_id → chatId (the
 * conversation/routing key), sender → `from` (the sender, also the allowlist key),
 * content.body → text, event_id → id. A Matrix room is multi-user → isGroup.
 */
export function parseMatrixEvents(json: unknown, selfUserId?: string): InboundMessage[] {
  if (!Array.isArray(json)) return [];
  const messages: InboundMessage[] = [];
  for (const raw of json) {
    const parsed = MatrixEvent.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (selfUserId !== undefined && e.sender === selfUserId) continue; // anti-loop: never route own events
    if (e.content.msgtype !== TEXT_MSGTYPE) continue; // only m.text is a routable chat message
    messages.push({
      chatId: e.room_id,
      from: e.sender,
      text: stripControl(e.content.body),
      id: e.event_id,
      isGroup: true, // a Matrix room is multi-user by nature
    });
  }
  return messages;
}

/**
 * Build the send content for PUT /rooms/<room>/send/m.room.message. A Matrix text
 * message is {msgtype:"m.text", body}; the body is control-stripped (the agent's reply
 * is trusted, but the strip keeps outbound bytes clean and matches inbound handling).
 * Pure.
 */
export function buildMatrixSendContent(text: string): { msgtype: "m.text"; body: string } {
  return { msgtype: TEXT_MSGTYPE, body: stripControl(text) };
}

/**
 * Parse the VANTA_MATRIX_ALLOWLIST room/user-id allowlist (comma list). Empty/absent →
 * an empty set, which the adapter treats as "allow all". Pure.
 */
export function parseMatrixAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.VANTA_MATRIX_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Matrix is enabled only when BOTH a homeserver URL and an access token are configured —
 * one without the other can neither sync nor send. Pure.
 */
export function matrixEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.VANTA_MATRIX_HOMESERVER &&
      env.VANTA_MATRIX_HOMESERVER.trim() &&
      env.VANTA_MATRIX_TOKEN &&
      env.VANTA_MATRIX_TOKEN.trim(),
  );
}

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
