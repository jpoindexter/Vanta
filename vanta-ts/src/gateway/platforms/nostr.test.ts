import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  parseNostrEvents,
  serializeNostrEvent,
  nostrEventId,
  buildNostrEvent,
  buildSubscribeFrame,
  buildPublishFrame,
  parseNostrAllowlist,
  parseNostrRelays,
  nostrEnabled,
  stripControl,
  NostrAdapter,
  type NostrTransport,
  type UnsignedNostrEvent,
  type SignedNostrEvent,
} from "./nostr.js";
import type { OutboundMessage } from "./base.js";

// A pubkey/event-id are 64-hex-char strings in real Nostr; the fixtures use short
// readable stand-ins (the pure fns don't validate hex length, only shape).
const SELF = "vanta_pubkey";
const ALICE = "alice_pubkey";
const BOB = "bob_pubkey";

/** A relay→client EVENT frame (already-parsed array) carrying a kind-1 note from ALICE. */
function noteFrame(over: Partial<Record<string, unknown>> = {}): unknown {
  return [
    "EVENT",
    "sub-1",
    {
      id: "evt1",
      pubkey: ALICE,
      created_at: 1700000000,
      kind: 1,
      tags: [["p", SELF]],
      content: "hi vanta",
      sig: "deadbeef",
      ...over,
    },
  ];
}

/** A relay→client EVENT frame carrying a kind-4 encrypted DM from BOB. */
function dmFrame(over: Partial<Record<string, unknown>> = {}): unknown {
  return [
    "EVENT",
    "sub-1",
    {
      id: "evt2",
      pubkey: BOB,
      created_at: 1700000001,
      kind: 4,
      tags: [["p", SELF]],
      content: "ciphertext==?iv=abc",
      sig: "cafef00d",
      ...over,
    },
  ];
}

describe("parseNostrEvents", () => {
  it("maps a kind-1 note EVENT frame to an InboundMessage (chatId/from = author pubkey)", () => {
    expect(parseNostrEvents([noteFrame()])).toEqual([
      { chatId: ALICE, from: ALICE, text: "hi vanta", id: "evt1", isGroup: false },
    ]);
  });

  it("maps a kind-4 DM EVENT frame (content passes through un-decrypted)", () => {
    expect(parseNostrEvents([dmFrame()])).toEqual([
      { chatId: BOB, from: BOB, text: "ciphertext==?iv=abc", id: "evt2", isGroup: false },
    ]);
  });

  it("accepts a single raw JSON-string frame (what a relay socket delivers)", () => {
    expect(parseNostrEvents(JSON.stringify(noteFrame()))).toEqual([
      { chatId: ALICE, from: ALICE, text: "hi vanta", id: "evt1", isGroup: false },
    ]);
  });

  it("accepts a single already-parsed array frame", () => {
    expect(parseNostrEvents(noteFrame()).map((m) => m.id)).toEqual(["evt1"]);
  });

  it("accepts an array of mixed frames (note + dm)", () => {
    expect(parseNostrEvents([noteFrame(), dmFrame()]).map((m) => m.id)).toEqual(["evt1", "evt2"]);
  });

  it("SKIPS our own event echoed back through the subscription (anti-loop)", () => {
    const out = parseNostrEvents(
      [noteFrame(), noteFrame({ id: "mine", pubkey: SELF, content: "my own note" })],
      SELF,
    );
    expect(out.map((m) => m.id)).toEqual(["evt1"]);
  });

  it("SKIPS a non-routed kind (kind 0 metadata, kind 7 reaction carry no agent text)", () => {
    const out = parseNostrEvents([
      noteFrame(),
      noteFrame({ id: "meta", kind: 0, content: "{name:bot}" }),
      noteFrame({ id: "react", kind: 7, content: "+" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["evt1"]);
  });

  it("SKIPS a non-EVENT relay frame (EOSE/OK/CLOSED/NOTICE carry no chat event)", () => {
    const out = parseNostrEvents([
      noteFrame(),
      ["EOSE", "sub-1"],
      ["OK", "evt1", true, ""],
      ["CLOSED", "sub-1", "rate-limited"],
      ["NOTICE", "hello from relay"],
    ]);
    expect(out.map((m) => m.id)).toEqual(["evt1"]);
  });

  it("control-strips untrusted inbound content (keeping newlines/tabs)", () => {
    const out = parseNostrEvents([noteFrame({ content: "a\x1b[31mred\x07\x00b\nline2" })]);
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("returns [] for garbage (non-array, bad JSON, wrong frame type → empty out)", () => {
    expect(parseNostrEvents(null)).toEqual([]);
    expect(parseNostrEvents(undefined)).toEqual([]);
    expect(parseNostrEvents(42)).toEqual([]);
    expect(parseNostrEvents("not json")).toEqual([]);
    expect(parseNostrEvents(["EVENT"])).toEqual([]); // too short (no event payload)
    expect(parseNostrEvents([["EVENT", "sub", { id: "x" }]])).toEqual([]); // event fails shape
  });

  it("drops only the malformed frames, keeps the valid ones", () => {
    const out = parseNostrEvents([noteFrame({ id: "a" }), { junk: true }, "garbage", dmFrame({ id: "b" })]);
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("defaults missing tags to [] (a note with no tags still parses)", () => {
    const frame = ["EVENT", "s", { id: "nt", pubkey: ALICE, created_at: 1, kind: 1, content: "no tags" }];
    expect(parseNostrEvents([frame]).map((m) => m.text)).toEqual(["no tags"]);
  });
});

describe("serializeNostrEvent + nostrEventId", () => {
  const evt: UnsignedNostrEvent = {
    pubkey: ALICE,
    created_at: 1700000000,
    kind: 1,
    tags: [["p", SELF]],
    content: "hello",
  };

  it("serializes to the NIP-01 canonical array [0, pubkey, created_at, kind, tags, content]", () => {
    expect(serializeNostrEvent(evt)).toEqual([0, ALICE, 1700000000, 1, [["p", SELF]], "hello"]);
  });

  it("computes the id as sha256 of the whitespace-free JSON of that array (lowercase hex)", () => {
    const serialized = serializeNostrEvent(evt);
    const expected = createHash("sha256").update(JSON.stringify(serialized), "utf8").digest("hex");
    expect(nostrEventId(serialized)).toBe(expected);
    expect(nostrEventId(serialized)).toMatch(/^[0-9a-f]{64}$/); // 32-byte hex
  });

  it("is deterministic — same event → same id", () => {
    expect(nostrEventId(serializeNostrEvent(evt))).toBe(nostrEventId(serializeNostrEvent(evt)));
  });

  it("changes the id when any field changes (content)", () => {
    const a = nostrEventId(serializeNostrEvent(evt));
    const b = nostrEventId(serializeNostrEvent({ ...evt, content: "hello!" }));
    expect(a).not.toBe(b);
  });

  it("escapes content via JSON.stringify so a newline/quote in content is hashed per NIP-01", () => {
    // JSON.stringify applies NIP-01's required escapes; the serialized string must
    // contain the escaped forms, not raw control bytes.
    const tricky: UnsignedNostrEvent = { ...evt, content: 'line1\nl"q"' };
    const json = JSON.stringify(serializeNostrEvent(tricky));
    expect(json).toContain("\\n");
    expect(json).toContain('\\"');
    expect(nostrEventId(serializeNostrEvent(tricky))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildNostrEvent", () => {
  it("builds a kind-1 note p-tagged to the recipient, with a derived id and empty sig", () => {
    const evt = buildNostrEvent(SELF, ALICE, "reply text", 1700000000);
    expect(evt.kind).toBe(1);
    expect(evt.pubkey).toBe(SELF);
    expect(evt.created_at).toBe(1700000000);
    expect(evt.tags).toEqual([["p", ALICE]]);
    expect(evt.content).toBe("reply text");
    expect(evt.sig).toBe(""); // signing is the transport's job, not the pure builder's
    expect(evt.id).toBe(nostrEventId(serializeNostrEvent(evt)));
  });

  it("control-strips the outbound content (keeping newlines/tabs)", () => {
    const evt = buildNostrEvent(SELF, ALICE, "a\x00b\x1b\tc\nd", 1);
    expect(evt.content).toBe("ab\tc\nd");
  });

  it("the built id matches an independently-computed sha256 of the serialization", () => {
    const evt = buildNostrEvent(SELF, BOB, "hi", 42);
    const expected = createHash("sha256")
      .update(JSON.stringify([0, SELF, 42, 1, [["p", BOB]], "hi"]), "utf8")
      .digest("hex");
    expect(evt.id).toBe(expected);
  });
});

describe("buildSubscribeFrame / buildPublishFrame", () => {
  it("builds a REQ frame filtering kinds [1,4] addressed to our pubkey via #p", () => {
    expect(buildSubscribeFrame("sub-9", SELF)).toEqual([
      "REQ",
      "sub-9",
      { kinds: [1, 4], "#p": [SELF] },
    ]);
  });

  it("builds an EVENT publish frame wrapping the signed event", () => {
    const evt: SignedNostrEvent = {
      pubkey: SELF,
      created_at: 1,
      kind: 1,
      tags: [["p", ALICE]],
      content: "x",
      id: "abc",
      sig: "sigsig",
    };
    expect(buildPublishFrame(evt)).toEqual(["EVENT", evt]);
  });
});

describe("parseNostrAllowlist / parseNostrRelays", () => {
  it("parses a comma list of author pubkeys", () => {
    expect(parseNostrAllowlist({ VANTA_NOSTR_ALLOWLIST: `${ALICE}, ${BOB} ,x` } as NodeJS.ProcessEnv)).toEqual(
      new Set([ALICE, BOB, "x"]),
    );
  });

  it("empty/absent allowlist → empty set (adapter reads as allow-all)", () => {
    expect(parseNostrAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseNostrAllowlist({ VANTA_NOSTR_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });

  it("parses a comma list of relay URLs, trimming blanks", () => {
    expect(
      parseNostrRelays({ VANTA_NOSTR_RELAYS: "wss://relay.one, wss://relay.two ," } as NodeJS.ProcessEnv),
    ).toEqual(["wss://relay.one", "wss://relay.two"]);
  });

  it("absent relays → []", () => {
    expect(parseNostrRelays({} as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("nostrEnabled", () => {
  it("true only when BOTH a privkey and at least one relay are configured", () => {
    expect(
      nostrEnabled({ VANTA_NOSTR_PRIVKEY: "ab12", VANTA_NOSTR_RELAYS: "wss://r" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("false when the privkey or the relays are missing/blank", () => {
    expect(nostrEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(nostrEnabled({ VANTA_NOSTR_PRIVKEY: "ab12" } as NodeJS.ProcessEnv)).toBe(false);
    expect(nostrEnabled({ VANTA_NOSTR_RELAYS: "wss://r" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      nostrEnabled({ VANTA_NOSTR_PRIVKEY: "  ", VANTA_NOSTR_RELAYS: "wss://r" } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording publishes; no real network, no signing. */
function fakeTransport(pollResult: unknown): {
  transport: NostrTransport;
  published: Array<{ toPubkey: string; text: string }>;
} {
  const published: Array<{ toPubkey: string; text: string }> = [];
  const transport: NostrTransport = {
    pubkey: SELF,
    connect: async () => {},
    disconnect: async () => {},
    poll: async () => pollResult,
    publish: async (toPubkey, text) => {
      published.push({ toPubkey, text });
    },
  };
  return { transport, published };
}

describe("NostrAdapter (injected transport — no real relay, no signing)", () => {
  it("polls via the injected transport and parses inbound events", async () => {
    const { transport } = fakeTransport([noteFrame()]);
    const adapter = new NostrAdapter({ transport });
    expect(adapter.id).toBe("nostr");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: ALICE, from: ALICE, text: "hi vanta", id: "evt1", isGroup: false }]);
  });

  it("skips our own echoed event using the transport's pubkey (anti-loop)", async () => {
    const { transport } = fakeTransport([noteFrame(), noteFrame({ id: "mine", pubkey: SELF, content: "self" })]);
    const adapter = new NostrAdapter({ transport });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["evt1"]);
  });

  it("returns [] (never throws) when the transport poll rejects", async () => {
    const transport: NostrTransport = {
      pubkey: SELF,
      connect: async () => {},
      disconnect: async () => {},
      poll: async () => {
        throw new Error("relay down");
      },
      publish: async () => {},
    };
    const adapter = new NostrAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (author pubkey)", async () => {
    const { transport } = fakeTransport([noteFrame({ id: "a", pubkey: ALICE }), dmFrame({ id: "b", pubkey: BOB })]);
    const adapter = new NostrAdapter({ transport, allow: new Set([ALICE]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["a"]);
  });

  it("publishes a reply addressed to chatId (the conversation pubkey)", async () => {
    const { transport, published } = fakeTransport([]);
    const adapter = new NostrAdapter({ transport });
    const out: OutboundMessage = { chatId: ALICE, text: "reply" };
    await adapter.send(out);
    expect(published).toEqual([{ toPubkey: ALICE, text: "reply" }]);
  });

  it("degrades markdown to plain text before publishing (no leaked ** fences)", async () => {
    const { transport, published } = fakeTransport([]);
    const adapter = new NostrAdapter({ transport });
    await adapter.send({ chatId: ALICE, text: "this is **bold** text" });
    expect(published[0]?.text).toBe("this is bold text");
  });

  it("splits an over-budget reply into multiple publishes (each within the budget)", async () => {
    const { transport, published } = fakeTransport([]);
    const adapter = new NostrAdapter({ transport });
    await adapter.send({ chatId: BOB, text: "z".repeat(17000) });
    expect(published.length).toBeGreaterThan(1);
    let total = 0;
    for (const p of published) {
      expect(p.toPubkey).toBe(BOB);
      expect(p.text.length).toBeLessThanOrEqual(8000);
      total += p.text.length;
    }
    expect(total).toBe(17000);
  });

  it("does not throw through the loop when a publish rejects (errors-as-values)", async () => {
    const transport: NostrTransport = {
      pubkey: SELF,
      connect: async () => {},
      disconnect: async () => {},
      poll: async () => [],
      publish: async () => {
        throw new Error("publish failed");
      },
    };
    const adapter = new NostrAdapter({ transport });
    await expect(adapter.send({ chatId: ALICE, text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect delegate to the transport and never throw", async () => {
    let connected = false;
    let disconnected = false;
    const transport: NostrTransport = {
      pubkey: SELF,
      connect: async () => {
        connected = true;
      },
      disconnect: async () => {
        disconnected = true;
      },
      poll: async () => [],
      publish: async () => {},
    };
    const adapter = new NostrAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
    expect(connected).toBe(true);
    expect(disconnected).toBe(true);
  });

  it("connect swallows a transport connect failure (errors-as-values)", async () => {
    const transport: NostrTransport = {
      pubkey: SELF,
      connect: async () => {
        throw new Error("dial failed");
      },
      disconnect: async () => {},
      poll: async () => [],
      publish: async () => {},
    };
    const adapter = new NostrAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
  });
});
