import { describe, it, expect } from "vitest";
import {
  parseGoogleChatEvents,
  buildGoogleChatSend,
  parseGoogleChatAllowlist,
  googleChatEnabled,
  stripControl,
  GoogleChatAdapter,
  type GoogleChatTransport,
} from "./google-chat.js";
import type { OutboundMessage } from "./base.js";

/** A Google Chat MESSAGE event as it arrives from the bot endpoint. */
function event(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "MESSAGE",
    message: {
      name: "spaces/AAA/messages/m1",
      text: "hi",
      sender: { name: "users/alice", type: "HUMAN" },
      space: { name: "spaces/AAA" },
    },
    ...over,
  };
}

/** A MESSAGE event with a patched `message` sub-object (keeps the other message fields). */
function messageEvent(message: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "MESSAGE",
    message: {
      name: "spaces/AAA/messages/m1",
      text: "hi",
      sender: { name: "users/alice", type: "HUMAN" },
      space: { name: "spaces/AAA" },
      ...message,
    },
  };
}

describe("parseGoogleChatEvents", () => {
  it("maps a MESSAGE event to an InboundMessage on the shared contract", () => {
    expect(parseGoogleChatEvents([event()])).toEqual([
      {
        chatId: "spaces/AAA",
        from: "users/alice",
        text: "hi",
        id: "spaces/AAA/messages/m1",
        isGroup: true,
      },
    ]);
  });

  it("SKIPS a BOT-sent event (anti-loop — never replies to its own/another bot's message)", () => {
    const out = parseGoogleChatEvents([
      messageEvent({ name: "spaces/AAA/messages/m1", sender: { name: "users/alice", type: "HUMAN" } }),
      messageEvent({ name: "spaces/AAA/messages/m2", sender: { name: "users/vanta", type: "BOT" } }),
    ]);
    expect(out).toEqual([
      {
        chatId: "spaces/AAA",
        from: "users/alice",
        text: "hi",
        id: "spaces/AAA/messages/m1",
        isGroup: true,
      },
    ]);
  });

  it("SKIPS a non-MESSAGE event type (ADDED_TO_SPACE carries no agent-facing text)", () => {
    const out = parseGoogleChatEvents([
      messageEvent({ name: "spaces/AAA/messages/m1" }),
      { type: "ADDED_TO_SPACE", message: messageEvent({ name: "spaces/AAA/messages/m2" }).message },
    ]);
    expect(out.map((m) => m.id)).toEqual(["spaces/AAA/messages/m1"]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseGoogleChatEvents([messageEvent({ text: "a\x1b[31mred\x07\x00b\nline2" })]);
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("returns [] for a non-array (garbage in → empty out)", () => {
    expect(parseGoogleChatEvents(null)).toEqual([]);
    expect(parseGoogleChatEvents(undefined)).toEqual([]);
    expect(parseGoogleChatEvents({})).toEqual([]);
    expect(parseGoogleChatEvents("not json")).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseGoogleChatEvents([
      messageEvent({ name: "spaces/AAA/messages/m1" }),
      { junk: true },
      messageEvent({ name: "spaces/AAA/messages/m2" }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["spaces/AAA/messages/m1", "spaces/AAA/messages/m2"]);
  });
});

describe("buildGoogleChatSend", () => {
  it("wraps text in a {text} body object", () => {
    expect(buildGoogleChatSend("hello")).toEqual({ text: "hello" });
  });

  it("control-strips the outbound body (keeping newlines/tabs)", () => {
    expect(buildGoogleChatSend("a\x00b\x1b\tc\nd")).toEqual({ text: "ab\tc\nd" });
  });
});

describe("parseGoogleChatAllowlist", () => {
  it("parses a comma list of space/sender names", () => {
    expect(
      parseGoogleChatAllowlist({
        VANTA_GOOGLE_CHAT_ALLOWLIST: "spaces/AAA, users/u2 ,spaces/BBB",
      } as NodeJS.ProcessEnv),
    ).toEqual(new Set(["spaces/AAA", "users/u2", "spaces/BBB"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseGoogleChatAllowlist({ VANTA_GOOGLE_CHAT_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseGoogleChatAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseGoogleChatAllowlist({ VANTA_GOOGLE_CHAT_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("googleChatEnabled", () => {
  it("true only when the token is present + non-blank", () => {
    expect(googleChatEnabled({ VANTA_GOOGLE_CHAT_TOKEN: "tok" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("false when the token is absent or blank (not configured = disabled)", () => {
    expect(googleChatEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(googleChatEnabled({ VANTA_GOOGLE_CHAT_TOKEN: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(googleChatEnabled({ VANTA_GOOGLE_CHAT_TOKEN: "  " } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording sends; no real network. */
function fakeTransport(pollResult: unknown): {
  transport: GoogleChatTransport;
  sends: Array<{ space: string; body: unknown }>;
} {
  const sends: Array<{ space: string; body: unknown }> = [];
  const transport: GoogleChatTransport = {
    poll: async () => pollResult,
    postMessage: async (space, body) => {
      sends.push({ space, body });
    },
  };
  return { transport, sends };
}

describe("GoogleChatAdapter (injected transport — no real Google Chat API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport([messageEvent({ text: "ping" })]);
    const adapter = new GoogleChatAdapter({ transport });
    expect(adapter.id).toBe("googlechat");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([
      {
        chatId: "spaces/AAA",
        from: "users/alice",
        text: "ping",
        id: "spaces/AAA/messages/m1",
        isGroup: true,
      },
    ]);
  });

  it("skips BOT-sent events on poll (anti-loop through the adapter)", async () => {
    const { transport } = fakeTransport([
      messageEvent({ name: "spaces/AAA/messages/m1", sender: { name: "users/alice", type: "HUMAN" } }),
      messageEvent({ name: "spaces/AAA/messages/m2", sender: { name: "users/vanta", type: "BOT" } }),
    ]);
    const adapter = new GoogleChatAdapter({ transport });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["spaces/AAA/messages/m1"]);
  });

  it("returns [] (never throws) when the transport poll rejects", async () => {
    const transport: GoogleChatTransport = {
      poll: async () => {
        throw new Error("network down");
      },
      postMessage: async () => {},
    };
    const adapter = new GoogleChatAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (space OR sender name)", async () => {
    const { transport } = fakeTransport([
      messageEvent({
        name: "spaces/AAA/messages/m1",
        space: { name: "spaces/AAA" },
        sender: { name: "users/u1", type: "HUMAN" },
      }),
      messageEvent({
        name: "spaces/ZZZ/messages/m2",
        space: { name: "spaces/ZZZ" },
        sender: { name: "users/u9", type: "HUMAN" },
      }),
    ]);
    const adapter = new GoogleChatAdapter({ transport, allow: new Set(["spaces/AAA"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["spaces/AAA/messages/m1"]);
  });

  it("sends via postMessage with the {text} body to the space", async () => {
    const { transport, sends } = fakeTransport([]);
    const adapter = new GoogleChatAdapter({ transport });
    const out: OutboundMessage = { chatId: "spaces/AAA", text: "reply" };
    await adapter.send(out);
    expect(sends).toEqual([{ space: "spaces/AAA", body: { text: "reply" } }]);
  });

  it("splits an over-budget reply into multiple sends (each a valid {text} body)", async () => {
    const { transport, sends } = fakeTransport([]);
    const adapter = new GoogleChatAdapter({ transport });
    await adapter.send({ chatId: "spaces/AAA", text: "z".repeat(9000) });
    expect(sends.length).toBeGreaterThan(1);
    for (const s of sends) {
      const body = s.body as { text: string };
      expect(body.text.length).toBeLessThanOrEqual(4000);
    }
    const total = sends.reduce((n, s) => n + (s.body as { text: string }).text.length, 0);
    expect(total).toBe(9000);
  });

  it("does not throw through the loop when a send rejects (errors-as-values)", async () => {
    const transport: GoogleChatTransport = {
      poll: async () => [],
      postMessage: async () => {
        throw new Error("send failed");
      },
    };
    const adapter = new GoogleChatAdapter({ transport });
    await expect(adapter.send({ chatId: "spaces/AAA", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport([]);
    const adapter = new GoogleChatAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
