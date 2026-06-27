import { z } from "zod";
import type { InboundMessage } from "./base.js";

// Pure parse/build/allowlist/enable helpers for the Matrix adapter (`matrix.ts`).
// Split out so each file stays under the size gate; `matrix.ts` re-exports these so the
// module path (`./matrix.js`) is unchanged for importers. All fns here are pure and
// unit-tested offline — no network, no secret.

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
