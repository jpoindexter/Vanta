import type { InboundMessage, OutboundMessage, PlatformAdapter } from "./base.js";
import { formatForDialect } from "./format.js";
import { splitForLimit } from "./split.js";
import {
  buildNostrEvent,
  buildPublishFrame,
  buildSubscribeFrame,
  parseNostrEvents,
} from "./nostr-parse.js";

// Nostr adapter — same PlatformAdapter contract as Telegram/Matrix/LINE. Inbound
// arrives over a long-lived relay WebSocket (not stateless REST): the transport
// owns the sockets, REQ-subscribes, buffers inbound EVENT frames, publishes
// outbound EVENT frames. Pure parse/build/serialize/id fns live in ./nostr-parse.js
// (re-exported below, unit-tested OFFLINE); the secret (privkey) is read ONLY inside
// the transport factory, and the schnorr signer is DYNAMICALLY imported so this
// module + pure-fn tests load even without `@noble/curves` installed.
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

// Re-export the pure helpers so this module's public surface (used by the registry +
// tests) is unchanged after the parse/adapter split.
export {
  stripControl,
  parseNostrEvents,
  serializeNostrEvent,
  nostrEventId,
  buildNostrEvent,
  parseNostrAllowlist,
  parseNostrRelays,
  nostrEnabled,
  buildSubscribeFrame,
  buildPublishFrame,
} from "./nostr-parse.js";
export type { UnsignedNostrEvent, SignedNostrEvent, SerializedNostrEvent } from "./nostr-parse.js";

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
