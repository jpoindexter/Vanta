import { createHash } from "node:crypto";
import { z } from "zod";
import type { InboundMessage } from "./base.js";

// Nostr — pure helpers: relay-frame parse, NIP-01 serialize/id/build, allowlist/relay/enable
// checks, and the REQ/EVENT frame builders. Sibling to nostr.ts (the stateful adapter + live
// relay transport + schnorr signer), which imports + re-exports these so the module's public
// surface (registry + tests) is unchanged. No secret/network here — unit-tested offline.

// Strip C0/C1 control chars (incl. ESC, DEL) from untrusted inbound text but KEEP
// \n and \t (legitimate in a multi-line chat message). Defends against escape/
// control injection from a remote sender before the text reaches the agent.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/** Strip control chars (keeping \n and \t) from untrusted inbound text. Pure. */
export function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

// Routed kinds: 1 = text note (mention), 4 = NIP-04 encrypted DM. Other kinds
// (metadata, reactions, reposts, …) carry no routable agent text and are skipped.
const KIND_TEXT_NOTE = 1;
const KIND_ENCRYPTED_DM = 4;
const ROUTED_KINDS = [KIND_TEXT_NOTE, KIND_ENCRYPTED_DM] as const;

// A relay frame is a JSON array; arr[0] is the message type. We route only the
// EVENT frame ["EVENT", <sub>, <event>]; EOSE/OK/CLOSED/NOTICE carry no chat event.
const FRAME_EVENT = "EVENT";

// A Nostr event inside a relay EVENT frame. Tolerant: only routed fields required;
// unknown extras (sig, present but unused on parse) ignored; a bad payload drops.
const NostrEvent = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())).default([]),
  content: z.string(),
});

/** Coerce a raw relay frame (JSON string OR array) into the parsed array, else null. Pure. */
function frameToArray(frame: unknown): unknown[] | null {
  let value: unknown = frame;
  if (typeof frame === "string") {
    try {
      value = JSON.parse(frame);
    } catch {
      return null;
    }
  }
  return Array.isArray(value) ? value : null;
}

/** Parse ONE relay frame into an inbound message, or null when it carries no
 *  routable chat event (not an EVENT frame, not a routed kind, or our own echo). */
function parseOneFrame(raw: unknown, selfPubkey?: string): InboundMessage | null {
  const arr = frameToArray(raw);
  if (!arr || arr[0] !== FRAME_EVENT || arr.length < 3) return null; // relay EVENT = [type, sub, event]
  const parsed = NostrEvent.safeParse(arr[2]);
  if (!parsed.success) return null;
  const e = parsed.data;
  if (selfPubkey !== undefined && e.pubkey === selfPubkey) return null; // anti-loop: never route our own event
  if (!ROUTED_KINDS.includes(e.kind as (typeof ROUTED_KINDS)[number])) return null; // only kind 1 / 4
  // chatId = from = author pubkey (the conversation key we reply p-tagged to); 1:1.
  return { chatId: e.pubkey, from: e.pubkey, text: stripControl(e.content), id: e.id, isGroup: false };
}

/** Parse one or many relay frames into inbound messages — a single frame (raw JSON
 *  string OR parsed array) or an array; keeps only an EVENT frame of a routed kind,
 *  skipping other frames/kinds and `selfPubkey` echoes. Tolerant; text-stripped. Pure. */
export function parseNostrEvents(frame: unknown, selfPubkey?: string): InboundMessage[] {
  const frames = Array.isArray(frame) && typeof frame[0] !== "string" ? frame : [frame];
  const messages: InboundMessage[] = [];
  for (const raw of frames) {
    const msg = parseOneFrame(raw, selfPubkey);
    if (msg) messages.push(msg);
  }
  return messages;
}

/** A Nostr event ready to serialize/sign: the id-relevant fields, no id/sig yet. */
export type UnsignedNostrEvent = {
  pubkey: string; created_at: number; kind: number; tags: string[][]; content: string;
};

/** A fully-built, signed Nostr event ready to publish in an EVENT frame. */
export type SignedNostrEvent = UnsignedNostrEvent & { id: string; sig: string };

/** The NIP-01 canonical id-derivation array: [0, pubkey, created_at, kind, tags, content]. */
export type SerializedNostrEvent = [0, string, number, number, string[][], string];

/** Serialize to the NIP-01 id array. `JSON.stringify` of it is exactly the UTF-8,
 *  whitespace-free, escaped (\n \" \\ …) string NIP-01 hashes. Pure. */
export function serializeNostrEvent(evt: UnsignedNostrEvent): SerializedNostrEvent {
  return [0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content];
}

/** id = sha256 of the whitespace-free JSON of the serialized array, lowercase hex
 *  (node:crypto — dep-free). Pure. */
export function nostrEventId(serialized: SerializedNostrEvent): string {
  return createHash("sha256").update(JSON.stringify(serialized), "utf8").digest("hex");
}

/** Build a kind-1 reply note p-tagged to `toPubkey` (public reply, in the clear
 *  this slice — see NOTES) with `id` derived; `sig` left "" (signing is the
 *  transport's job). `now` injectable. Pure (no secret; only the dep-free hash). */
export function buildNostrEvent(
  pubkey: string, toPubkey: string, text: string, now: number = Math.floor(Date.now() / 1000),
): SignedNostrEvent {
  // tags: a ["p", recipient] tag addresses the reply; sig "" — the transport signs.
  const evt: UnsignedNostrEvent = {
    pubkey, created_at: now, kind: KIND_TEXT_NOTE, tags: [["p", toPubkey]], content: stripControl(text),
  };
  return { ...evt, id: nostrEventId(serializeNostrEvent(evt)), sig: "" };
}

/** Split a comma-separated env value into trimmed non-empty entries. Pure. */
const commaList = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Parse VANTA_NOSTR_ALLOWLIST author-pubkey allowlist. Empty → empty set, which
 *  the adapter treats as "allow all". Pure. */
export function parseNostrAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(commaList(env.VANTA_NOSTR_ALLOWLIST));
}

/** Parse VANTA_NOSTR_RELAYS — comma list of wss:// (or ws://) relay URLs the
 *  transport factory dials. Empty → []. Pure. */
export function parseNostrRelays(env: NodeJS.ProcessEnv): string[] {
  return commaList(env.VANTA_NOSTR_RELAYS);
}

/** Nostr is enabled only when BOTH a secret key and ≥1 relay are configured — one
 *  without the other can neither subscribe nor publish. Pure. */
export function nostrEnabled(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.VANTA_NOSTR_PRIVKEY && env.VANTA_NOSTR_PRIVKEY.trim() && parseNostrRelays(env).length > 0);
}

type NostrReqFrame = ["REQ", string, { kinds: number[]; "#p": string[] }];

/** REQ subscribe frame: a {kinds:[1,4], #p:[<our pubkey>]} filter so the relay
 *  streams only routed events addressed to us. Pure. */
export function buildSubscribeFrame(subId: string, pubkey: string): NostrReqFrame {
  return ["REQ", subId, { kinds: [...ROUTED_KINDS], "#p": [pubkey] }];
}

/** Build the client→relay publish frame for a signed event: ["EVENT", <event>]. Pure. */
export function buildPublishFrame(evt: SignedNostrEvent): ["EVENT", SignedNostrEvent] {
  return ["EVENT", evt];
}
