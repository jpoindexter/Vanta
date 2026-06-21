import { describe, it, expect } from "vitest";
import {
  parseLineEvents,
  buildLinePushBody,
  parseLineAllowlist,
  lineEnabled,
  stripControl,
  LineAdapter,
  type LineTransport,
} from "./line.js";
import type { OutboundMessage } from "./base.js";

/** A LINE text-message webhook event from a 1:1 user source. */
function userEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "message",
    replyToken: "rt-1",
    timestamp: 1700000000000,
    message: { type: "text", id: "m1", text: "hi" },
    source: { type: "user", userId: "U_alice" },
    ...over,
  };
}

/** A LINE text-message webhook event from a group source. */
function groupEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "message",
    replyToken: "rt-2",
    timestamp: 1700000000000,
    message: { type: "text", id: "m2", text: "yo" },
    source: { type: "group", userId: "U_bob", groupId: "G_team" },
    ...over,
  };
}

describe("parseLineEvents", () => {
  it("maps a user text-message event to an InboundMessage (chatId=userId, not a group)", () => {
    expect(parseLineEvents([userEvent()])).toEqual([
      { chatId: "U_alice", from: "U_alice", text: "hi", id: "m1", isGroup: false },
    ]);
  });

  it("maps a group text-message event (chatId=groupId, isGroup true, from=userId)", () => {
    expect(parseLineEvents([groupEvent()])).toEqual([
      { chatId: "G_team", from: "U_bob", text: "yo", id: "m2", isGroup: true },
    ]);
  });

  it("accepts the {events:[...]} wrapper LINE delivers", () => {
    expect(parseLineEvents({ destination: "x", events: [userEvent()] })).toEqual([
      { chatId: "U_alice", from: "U_alice", text: "hi", id: "m1", isGroup: false },
    ]);
  });

  it("accepts a bare array of events", () => {
    expect(parseLineEvents([userEvent(), groupEvent()]).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("SKIPS a non-message event (a follow/join/postback carries no agent text)", () => {
    const out = parseLineEvents([
      userEvent({ message: { type: "text", id: "m1", text: "keep" } }),
      { type: "follow", replyToken: "rt", source: { type: "user", userId: "U_x" } },
      { type: "postback", source: { type: "user", userId: "U_y" }, postback: { data: "act=1" } },
    ]);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
  });

  it("SKIPS a non-text message (sticker/image carry no routable agent text)", () => {
    const out = parseLineEvents([
      userEvent({ message: { type: "text", id: "m1", text: "keep" } }),
      userEvent({ message: { type: "sticker", id: "s1", packageId: "1", stickerId: "1" } }),
      userEvent({ message: { type: "image", id: "i1" } }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseLineEvents([userEvent({ message: { type: "text", id: "m1", text: "a\x1b[31mred\x07\x00b\nline2" } })]);
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("returns [] for garbage (non-array, non-wrapper → empty out)", () => {
    expect(parseLineEvents(null)).toEqual([]);
    expect(parseLineEvents(undefined)).toEqual([]);
    expect(parseLineEvents({})).toEqual([]);
    expect(parseLineEvents({ events: "nope" })).toEqual([]);
    expect(parseLineEvents("not json")).toEqual([]);
    expect(parseLineEvents(42)).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseLineEvents([
      userEvent({ message: { type: "text", id: "m1", text: "a" } }),
      { junk: true },
      groupEvent({ message: { type: "text", id: "m2", text: "b" } }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("buildLinePushBody", () => {
  it("builds {to, messages:[{type:'text', text}]} keyed by chatId", () => {
    expect(buildLinePushBody("U_alice", "hello")).toEqual({
      to: "U_alice",
      messages: [{ type: "text", text: "hello" }],
    });
  });

  it("control-strips the outbound text (keeping newlines/tabs)", () => {
    expect(buildLinePushBody("G_team", "a\x00b\x1b\tc\nd")).toEqual({
      to: "G_team",
      messages: [{ type: "text", text: "ab\tc\nd" }],
    });
  });

  it("truncates over-5000-char text to the LINE per-message cap", () => {
    const body = buildLinePushBody("U_alice", "z".repeat(6000));
    expect(body.messages[0]?.text.length).toBe(5000);
  });
});

describe("parseLineAllowlist", () => {
  it("parses a comma list of user/group ids", () => {
    expect(
      parseLineAllowlist({ VANTA_LINE_ALLOWLIST: "U_alice, G_team ,U_bob" } as NodeJS.ProcessEnv),
    ).toEqual(new Set(["U_alice", "G_team", "U_bob"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseLineAllowlist({ VANTA_LINE_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseLineAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseLineAllowlist({ VANTA_LINE_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("lineEnabled", () => {
  it("true only when the token is present + non-blank", () => {
    expect(lineEnabled({ VANTA_LINE_TOKEN: "tok" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("false when the token is absent or blank (not configured = disabled)", () => {
    expect(lineEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(lineEnabled({ VANTA_LINE_TOKEN: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(lineEnabled({ VANTA_LINE_TOKEN: "  " } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording pushes; no real network. */
function fakeTransport(pollResult: unknown): {
  transport: LineTransport;
  pushes: Array<unknown>;
} {
  const pushes: Array<unknown> = [];
  const transport: LineTransport = {
    poll: async () => pollResult,
    push: async (body) => {
      pushes.push(body);
    },
  };
  return { transport, pushes };
}

describe("LineAdapter (injected transport — no real LINE API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport({ events: [userEvent({ message: { type: "text", id: "m1", text: "ping" } })] });
    const adapter = new LineAdapter({ transport });
    expect(adapter.id).toBe("line");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: "U_alice", from: "U_alice", text: "ping", id: "m1", isGroup: false }]);
  });

  it("returns [] (never throws) when the transport poll rejects", async () => {
    const transport: LineTransport = {
      poll: async () => {
        throw new Error("network down");
      },
      push: async () => {},
    };
    const adapter = new LineAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (chatId OR sender id)", async () => {
    const { transport } = fakeTransport([
      userEvent({ message: { type: "text", id: "m1", text: "ok" }, source: { type: "user", userId: "U_alice" } }),
      userEvent({ message: { type: "text", id: "m2", text: "no" }, source: { type: "user", userId: "U_zed" } }),
    ]);
    const adapter = new LineAdapter({ transport, allow: new Set(["U_alice"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["m1"]);
  });

  it("pushes a {to, messages} body keyed by chatId (the source id)", async () => {
    const { transport, pushes } = fakeTransport([]);
    const adapter = new LineAdapter({ transport });
    const out: OutboundMessage = { chatId: "U_alice", text: "reply" };
    await adapter.send(out);
    expect(pushes).toEqual([{ to: "U_alice", messages: [{ type: "text", text: "reply" }] }]);
  });

  it("splits an over-budget reply into multiple pushes (each a valid push body)", async () => {
    const { transport, pushes } = fakeTransport([]);
    const adapter = new LineAdapter({ transport });
    await adapter.send({ chatId: "G_team", text: "z".repeat(11000) });
    expect(pushes.length).toBeGreaterThan(1);
    let total = 0;
    for (const body of pushes) {
      const b = body as { to: string; messages: Array<{ type: string; text: string }> };
      expect(b.to).toBe("G_team");
      expect(b.messages[0]?.text.length).toBeLessThanOrEqual(5000);
      total += b.messages[0]?.text.length ?? 0;
    }
    expect(total).toBe(11000);
  });

  it("does not throw through the loop when a push rejects (errors-as-values)", async () => {
    const transport: LineTransport = {
      poll: async () => [],
      push: async () => {
        throw new Error("push failed");
      },
    };
    const adapter = new LineAdapter({ transport });
    await expect(adapter.send({ chatId: "U_alice", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport([]);
    const adapter = new LineAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
