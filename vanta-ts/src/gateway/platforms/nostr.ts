import { createHash } from "node:crypto";
import { z } from "zod";
import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";

// Nostr adapter — same PlatformAdapter contract as Telegram/Matrix/LINE. Inbound
// arrives over a long-lived relay WebSocket (not stateless REST): the transport
// owns the sockets, REQ-subscribes, buffers inbound EVENT frames, publishes
// outbound EVENT frames. Pure parse/build/serialize/id fns are unit-tested OFFLINE;
// the secret (privkey) is read ONLY inside the transport factory, and the schnorr
// signer is DYNAMICALLY imported so this module + pure-fn tests load even without
// `@noble/curves` installed.
//
// NIP-01 (verified): event {id, pubkey, created_at, kind, tags, content, sig}.
//   serialize-for-id = whitespace-free UTF-8 JSON of
//     [0, <pubkey hex>, <created_at>, <kind>, <tags>, <content>];
//   id = sha256(that) hex (node:crypto); sig = BIP-340 schnorr/secp256k1 over the
//   32-byte id (REQUIRES @noble/curves). relay→client EVENT = ["EVENT", <sub>,
//   <event>]; client REQ = ["REQ", <sub>, <filter>...], publish = ["EVENT", <event>].
//   A kind-1 mention and a kind-4 (NIP-04) DM are both p-tagged to us; we REQ
//   {kinds:[1,4], #p:[<our pubkey>]} so only events addressed to us arrive.
//
// InboundMessage mapping (`base.ts`, off-limits): chatId = from = event.pubkey (the
//   author = the conversation key we choose — a reply is p-tagged back to it, so the
//   counterparty pubkey IS the conversation; also the allowlist key). text =
//   event.content control-stripped (kind-1 plaintext; a kind-4 body is NIP-04
//   ciphertext passed through un-decrypted, see NOTES). id = event.id; isGroup =
//   false (1:1). Anti-loop: an event authored by OUR pubkey is skipped.

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

/** REQ subscribe frame: a {kinds:[1,4], #p:[<our pubkey>]} filter so the relay
 *  streams only routed events addressed to us. Pure. */
export function buildSubscribeFrame(subId: string, pubkey: string): NostrReqFrame {
  return ["REQ", subId, { kinds: [...ROUTED_KINDS], "#p": [pubkey] }];
}
type NostrReqFrame = ["REQ", string, { kinds: number[]; "#p": string[] }];

/** Build the client→relay publish frame for a signed event: ["EVENT", <event>]. Pure. */
export function buildPublishFrame(evt: SignedNostrEvent): ["EVENT", SignedNostrEvent] {
  return ["EVENT", evt];
}

// No hard protocol length cap, but relays reject oversized events; split a long
// reply at a generous char budget so it is SENT AS MULTIPLE notes, not rejected.
const NOSTR_TEXT_LIMIT = 8000;

/** The injected Nostr transport — the live boundary. `poll` drains buffered inbound
 *  frames; `publish` signs + broadcasts one event. The secret (privkey) is read ONLY
 *  inside the transport factory (the wire), never on the adapter nor a literal here.
 *  Tests pass a fake so no real network — and no secret/signing — is touched. */
export type NostrTransport = {
  pubkey: string; // our x-only public key hex (bot identity, derived from the privkey)
  connect: () => Promise<void>; // open the relay sockets + REQ-subscribe
  disconnect: () => Promise<void>; // tear down the relay sockets
  poll: () => Promise<unknown>; // drain buffered inbound frames since last poll
  publish: (toPubkey: string, text: string) => Promise<void>; // sign + broadcast a reply
};

export class NostrAdapter implements PlatformAdapter {
  readonly id = "nostr";
  private readonly transport: NostrTransport;
  private readonly allow: Set<string>;

  constructor(opts: { transport: NostrTransport; allow?: Set<string> }) {
    this.transport = opts.transport;
    this.allow = opts.allow ?? new Set();
  }

  async connect(): Promise<void> {
    await this.transport.connect().catch(() => {}); // errors-as-values: never throw at startup
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect().catch(() => {});
  }

  async poll(): Promise<InboundMessage[]> {
    const frames = await this.transport.poll().catch(() => undefined);
    const messages = parseNostrEvents(frames, this.transport.pubkey);
    if (this.allow.size === 0) return messages;
    // Allow a message whose author pubkey (chatId === from) is listed.
    return messages.filter((m) => this.allow.has(m.chatId) || (m.from !== undefined && this.allow.has(m.from)));
  }

  async send(msg: OutboundMessage): Promise<void> {
    // Nostr renders plain text, so degrade markdown to plain, split to budget, and
    // publish each part as its own note to the conversation pubkey (chatId).
    const formatted = formatForDialect(msg.text, "plain");
    for (const part of splitForLimit(formatted, NOSTR_TEXT_LIMIT, "chars")) {
      // errors-as-values: a publish failure must not throw through the gateway loop
      await this.transport.publish(msg.chatId, part).catch(() => {});
    }
  }
}

// THE ONLY crypto-dep path. `@noble/curves` (node:crypto can't do schnorr) is
// DYNAMICALLY imported in both fns below so the module + pure-fn tests load even
// without the dep — it resolves only at the wire when an event is signed / a pubkey
// derived. signNostrEvent: the 32-byte id is the BIP-340 message; sig = 64-byte hex.
export async function signNostrEvent(idHex: string, privkeyHex: string): Promise<string> {
  const { schnorr } = await import("@noble/curves/secp256k1.js");
  const sig = await schnorr.sign(Buffer.from(idHex, "hex"), Buffer.from(privkeyHex, "hex"));
  return Buffer.from(sig).toString("hex");
}

/** Derive the x-only (32-byte) schnorr public key hex from a secret key hex. */
export async function derivePublicKey(privkeyHex: string): Promise<string> {
  const { schnorr } = await import("@noble/curves/secp256k1.js");
  return Buffer.from(schnorr.getPublicKey(Buffer.from(privkeyHex, "hex"))).toString("hex");
}

// Wrap every relay socket op: a send/close against a closed/errored relay is
// non-fatal, so it is swallowed (errors-as-values, never throws through the loop).
const swallow = (fn: () => void): void => {
  try {
    fn();
  } catch {
    /* non-fatal */
  }
};

// Open one relay `WebSocket`: REQ-subscribe on open (pubkey read lazily), buffer
// inbound frames into `inbox`. A dead relay is swallowed.
function openRelaySocket(url: string, subId: string, getPubkey: () => string, inbox: unknown[]): WebSocket {
  const ws = new WebSocket(url);
  ws.addEventListener("open", () => swallow(() => ws.send(JSON.stringify(buildSubscribeFrame(subId, getPubkey())))));
  ws.addEventListener("message", (ev: MessageEvent) =>
    inbox.push(typeof ev.data === "string" ? ev.data : String(ev.data)),
  );
  ws.addEventListener("error", () => {}); // swallow; a dead relay is non-fatal
  return ws;
}

/** Broadcast a serialized frame to every OPEN socket; a closed socket is skipped. */
function broadcast(sockets: WebSocket[], frame: string): void {
  for (const ws of sockets) swallow(() => ws.readyState === WebSocket.OPEN && ws.send(frame));
}

/** Build the live Nostr relay transport. THE WIRE: the secret key is read ONLY here
 *  (derives our pubkey + signs every outbound event), never stored on the adapter
 *  nor a literal. Opens one `WebSocket` per relay, subscribes, buffers inbound,
 *  signs+broadcasts on publish. Live use needs a real key + reachable relays. */
export function httpTransport(privkey: string, relays: string[]): NostrTransport {
  const subId = `vanta-${Date.now().toString(36)}`;
  const sockets: WebSocket[] = [];
  const inbox: unknown[] = [];
  let pubkeyHex = "";

  return {
    get pubkey() { return pubkeyHex; },
    connect: async () => {
      pubkeyHex = await derivePublicKey(privkey); // read the secret only at the wire
      for (const url of relays) sockets.push(openRelaySocket(url, subId, () => pubkeyHex, inbox));
    },
    disconnect: async () => {
      for (const ws of sockets) swallow(() => ws.close());
      sockets.length = 0;
    },
    poll: async () => inbox.splice(0, inbox.length), // take + clear the buffer
    publish: async (toPubkey, text) => {
      const evt = buildNostrEvent(pubkeyHex, toPubkey, text);
      evt.sig = await signNostrEvent(evt.id, privkey); // read the secret only at the wire
      broadcast(sockets, JSON.stringify(buildPublishFrame(evt)));
    },
  };
}

/** Alias for the `nostrTransport(...)` name used in the adapter docs. */
export const nostrTransport = httpTransport;
