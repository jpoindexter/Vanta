import { describe, it, expect } from "vitest";
import {
  parseZaloEvents,
  buildZaloSend,
  parseZaloAllowlist,
  zaloEnabled,
  stripControl,
  ZaloAdapter,
  type ZaloTransport,
} from "./zalo.js";
import type { OutboundMessage } from "./base.js";

/** A Zalo OA `user_send_text` webhook event from a 1:1 user. */
function textEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app_id: "app-1",
    event_name: "user_send_text",
    timestamp: "1700000000000",
    sender: { id: "U_alice" },
    recipient: { id: "OA_vanta" },
    message: { text: "hi", msg_id: "m1" },
    ...over,
  };
}

describe("parseZaloEvents", () => {
  it("maps a user_send_text event to an InboundMessage (chatId=from=sender.id, not a group)", () => {
    expect(parseZaloEvents(textEvent())).toEqual([
      { chatId: "U_alice", from: "U_alice", text: "hi", id: "m1", isGroup: false },
    ]);
  });

  it("accepts a single event object (Zalo delivers one event per webhook POST)", () => {
    expect(parseZaloEvents(textEvent({ message: { text: "ping", msg_id: "m9" } }))).toEqual([
      { chatId: "U_alice", from: "U_alice", text: "ping", id: "m9", isGroup: false },
    ]);
  });

  it("accepts a bare array of events", () => {
    expect(
      parseZaloEvents([
        textEvent({ message: { text: "a", msg_id: "m1" } }),
        textEvent({ sender: { id: "U_bob" }, message: { text: "b", msg_id: "m2" } }),
      ]).map((m) => m.id),
    ).toEqual(["m1", "m2"]);
  });

  it("SKIPS a non-text event (image/sticker/follow/oa_send carry no agent text)", () => {
    const out = parseZaloEvents([
      textEvent({ message: { text: "keep", msg_id: "m1" } }),
      { event_name: "user_send_image", sender: { id: "U_x" }, message: { msg_id: "i1" } },
      { event_name: "follow", sender: { id: "U_y" } },
      { event_name: "oa_send_text", sender: { id: "OA_vanta" }, message: { text: "echo", msg_id: "o1" } },
    ]);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
  });

  it("SKIPS a user_send_text event with no message.text", () => {
    const out = parseZaloEvents([
      textEvent({ message: { text: "keep", msg_id: "m1" } }),
      { event_name: "user_send_text", sender: { id: "U_z" }, message: { msg_id: "m2" } },
    ]);
    expect(out.map((m) => m.id)).toEqual(["m1"]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseZaloEvents([
      textEvent({ message: { text: "a\x1b[31mred\x07\x00b\nline2", msg_id: "m1" } }),
    ]);
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("carries no id when message.msg_id is absent (id stays undefined)", () => {
    const out = parseZaloEvents([textEvent({ message: { text: "hi" } })]);
    expect(out).toEqual([{ chatId: "U_alice", from: "U_alice", text: "hi", id: undefined, isGroup: false }]);
  });

  it("returns [] for garbage (non-object, missing fields → empty out)", () => {
    expect(parseZaloEvents(null)).toEqual([]);
    expect(parseZaloEvents(undefined)).toEqual([]);
    expect(parseZaloEvents({})).toEqual([]);
    expect(parseZaloEvents({ event_name: "user_send_text" })).toEqual([]); // no sender
    expect(parseZaloEvents("not json")).toEqual([]);
    expect(parseZaloEvents(42)).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseZaloEvents([
      textEvent({ message: { text: "a", msg_id: "m1" } }),
      { junk: true },
      textEvent({ sender: { id: "U_bob" }, message: { text: "b", msg_id: "m2" } }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("buildZaloSend", () => {
  it("builds {recipient:{user_id}, message:{text}} keyed by userId", () => {
    expect(buildZaloSend("U_alice", "hello")).toEqual({
      recipient: { user_id: "U_alice" },
      message: { text: "hello" },
    });
  });

  it("control-strips the outbound text (keeping newlines/tabs)", () => {
    expect(buildZaloSend("U_bob", "a\x00b\x1b\tc\nd")).toEqual({
      recipient: { user_id: "U_bob" },
      message: { text: "ab\tc\nd" },
    });
  });

  it("truncates over-2000-char text to the Zalo per-message cap", () => {
    const body = buildZaloSend("U_alice", "z".repeat(3000));
    expect(body.message.text.length).toBe(2000);
  });
});

describe("parseZaloAllowlist", () => {
  it("parses a comma list of user ids", () => {
    expect(
      parseZaloAllowlist({ VANTA_ZALO_ALLOWLIST: "U_alice, U_team ,U_bob" } as NodeJS.ProcessEnv),
    ).toEqual(new Set(["U_alice", "U_team", "U_bob"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseZaloAllowlist({ VANTA_ZALO_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseZaloAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseZaloAllowlist({ VANTA_ZALO_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("zaloEnabled", () => {
  it("true only when the token is present + non-blank", () => {
    expect(zaloEnabled({ VANTA_ZALO_TOKEN: "tok" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("false when the token is absent or blank (not configured = disabled)", () => {
    expect(zaloEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(zaloEnabled({ VANTA_ZALO_TOKEN: "" } as NodeJS.ProcessEnv)).toBe(false);
    expect(zaloEnabled({ VANTA_ZALO_TOKEN: "  " } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording sends; no real network. */
function fakeTransport(pollResult: unknown): {
  transport: ZaloTransport;
  sends: Array<unknown>;
} {
  const sends: Array<unknown> = [];
  const transport: ZaloTransport = {
    poll: async () => pollResult,
    send: async (body) => {
      sends.push(body);
    },
  };
  return { transport, sends };
}

describe("ZaloAdapter (injected transport — no real Zalo OA API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport(textEvent({ message: { text: "ping", msg_id: "m1" } }));
    const adapter = new ZaloAdapter({ transport });
    expect(adapter.id).toBe("zalo");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: "U_alice", from: "U_alice", text: "ping", id: "m1", isGroup: false }]);
  });

  it("returns [] (never throws) when the transport poll rejects", async () => {
    const transport: ZaloTransport = {
      poll: async () => {
        throw new Error("network down");
      },
      send: async () => {},
    };
    const adapter = new ZaloAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (chatId OR sender id — both the user id)", async () => {
    const { transport } = fakeTransport([
      textEvent({ sender: { id: "U_alice" }, message: { text: "ok", msg_id: "m1" } }),
      textEvent({ sender: { id: "U_zed" }, message: { text: "no", msg_id: "m2" } }),
    ]);
    const adapter = new ZaloAdapter({ transport, allow: new Set(["U_alice"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["m1"]);
  });

  it("sends a {recipient:{user_id}, message:{text}} body keyed by chatId", async () => {
    const { transport, sends } = fakeTransport(null);
    const adapter = new ZaloAdapter({ transport });
    const out: OutboundMessage = { chatId: "U_alice", text: "reply" };
    await adapter.send(out);
    expect(sends).toEqual([{ recipient: { user_id: "U_alice" }, message: { text: "reply" } }]);
  });

  it("degrades markdown to plain text before sending", async () => {
    const { transport, sends } = fakeTransport(null);
    const adapter = new ZaloAdapter({ transport });
    await adapter.send({ chatId: "U_alice", text: "**bold** and _italic_" });
    expect(sends).toEqual([{ recipient: { user_id: "U_alice" }, message: { text: "bold and italic" } }]);
  });

  it("splits an over-budget reply into multiple sends (each a valid send body)", async () => {
    const { transport, sends } = fakeTransport(null);
    const adapter = new ZaloAdapter({ transport });
    await adapter.send({ chatId: "U_bob", text: "z".repeat(4500) });
    expect(sends.length).toBeGreaterThan(1);
    let total = 0;
    for (const body of sends) {
      const b = body as { recipient: { user_id: string }; message: { text: string } };
      expect(b.recipient.user_id).toBe("U_bob");
      expect(b.message.text.length).toBeLessThanOrEqual(2000);
      total += b.message.text.length;
    }
    expect(total).toBe(4500);
  });

  it("does not throw through the loop when a send rejects (errors-as-values)", async () => {
    const transport: ZaloTransport = {
      poll: async () => null,
      send: async () => {
        throw new Error("send failed");
      },
    };
    const adapter = new ZaloAdapter({ transport });
    await expect(adapter.send({ chatId: "U_alice", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport(null);
    const adapter = new ZaloAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
