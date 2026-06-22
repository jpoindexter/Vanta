import { describe, it, expect } from "vitest";
import {
  parseFeishuEvents,
  buildFeishuMessage,
  parseFeishuAllowlist,
  feishuEnabled,
  stripControl,
  FeishuAdapter,
  type FeishuTransport,
} from "./feishu.js";
import type { OutboundMessage } from "./base.js";

/** A Feishu `im.message.receive_v1` callback from a 1:1 (p2p) user chat. */
function userEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "2.0",
    header: { event_type: "im.message.receive_v1", token: "t", tenant_key: "tk" },
    event: {
      sender: { sender_id: { open_id: "ou_alice" }, sender_type: "user" },
      message: {
        message_id: "om_1",
        chat_id: "oc_dm",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "hi" }),
      },
    },
    ...over,
  };
}

/** A Feishu receive callback from a group chat. */
function groupEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: "2.0",
    header: { event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_bob" }, sender_type: "user" },
      message: {
        message_id: "om_2",
        chat_id: "oc_team",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "yo" }),
      },
    },
    ...over,
  };
}

/** Build an event with a patched `event` object (merges over the user-event default). */
function withEvent(event: Record<string, unknown>): Record<string, unknown> {
  return { ...userEvent(), event };
}

describe("parseFeishuEvents", () => {
  it("maps a p2p text-message event to an InboundMessage (chatId=chat_id, not a group)", () => {
    expect(parseFeishuEvents(userEvent())).toEqual([
      { chatId: "oc_dm", from: "ou_alice", text: "hi", id: "om_1", isGroup: false },
    ]);
  });

  it("maps a group text-message event (isGroup true, from=sender open_id)", () => {
    expect(parseFeishuEvents(groupEvent())).toEqual([
      { chatId: "oc_team", from: "ou_bob", text: "yo", id: "om_2", isGroup: true },
    ]);
  });

  it("accepts a single event object (one per webhook callback)", () => {
    expect(parseFeishuEvents(userEvent()).map((m) => m.id)).toEqual(["om_1"]);
  });

  it("accepts a bare array of events", () => {
    expect(parseFeishuEvents([userEvent(), groupEvent()]).map((m) => m.id)).toEqual(["om_1", "om_2"]);
  });

  it("parses the text out of the JSON-string content field", () => {
    const out = parseFeishuEvents(
      withEvent({
        sender: { sender_id: { open_id: "ou_x" }, sender_type: "user" },
        message: {
          message_id: "om_3",
          chat_id: "oc_dm",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "multi\nline" }),
        },
      }),
    );
    expect(out[0]?.text).toBe("multi\nline");
  });

  it("SKIPS a bot-sent event (anti-loop: never replies to itself)", () => {
    const out = parseFeishuEvents([
      userEvent(),
      withEvent({
        sender: { sender_id: { open_id: "ou_self" }, sender_type: "bot" },
        message: {
          message_id: "om_bot",
          chat_id: "oc_dm",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "echo" }),
        },
      }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["om_1"]);
  });

  it("SKIPS a non-receive event type (a reaction/recall carries no agent text)", () => {
    const out = parseFeishuEvents([
      userEvent(),
      { header: { event_type: "im.message.reaction.created_v1" }, event: groupEvent().event },
    ]);
    expect(out.map((m) => m.id)).toEqual(["om_1"]);
  });

  it("SKIPS a non-text message type (image/file/audio carry no routable agent text)", () => {
    const out = parseFeishuEvents([
      userEvent(),
      withEvent({
        sender: { sender_id: { open_id: "ou_y" }, sender_type: "user" },
        message: {
          message_id: "om_img",
          chat_id: "oc_dm",
          chat_type: "p2p",
          message_type: "image",
          content: JSON.stringify({ image_key: "img_v2_x" }),
        },
      }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["om_1"]);
  });

  it("SKIPS a text message whose content JSON is empty/unparseable", () => {
    const out = parseFeishuEvents([
      userEvent(),
      withEvent({
        sender: { sender_id: { open_id: "ou_z" }, sender_type: "user" },
        message: { message_id: "om_bad", chat_id: "oc_dm", message_type: "text", content: "not json" },
      }),
      withEvent({
        sender: { sender_id: { open_id: "ou_z2" }, sender_type: "user" },
        message: { message_id: "om_empty", chat_id: "oc_dm", message_type: "text", content: JSON.stringify({}) },
      }),
    ]);
    expect(out.map((m) => m.id)).toEqual(["om_1"]);
  });

  it("control-strips untrusted inbound text (keeping newlines/tabs)", () => {
    const out = parseFeishuEvents(
      withEvent({
        sender: { sender_id: { open_id: "ou_c" }, sender_type: "user" },
        message: {
          message_id: "om_c",
          chat_id: "oc_dm",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "a\x1b[31mred\x07\x00b\nline2" }),
        },
      }),
    );
    expect(out[0]?.text).toBe("a[31mredb\nline2");
  });

  it("tolerates a missing sender (from is undefined, message still routes)", () => {
    const out = parseFeishuEvents(
      withEvent({
        message: {
          message_id: "om_ns",
          chat_id: "oc_dm",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "anon" }),
        },
      }),
    );
    expect(out).toEqual([{ chatId: "oc_dm", from: undefined, text: "anon", id: "om_ns", isGroup: false }]);
  });

  it("returns [] for garbage (non-object/missing header or message → empty out)", () => {
    expect(parseFeishuEvents(null)).toEqual([]);
    expect(parseFeishuEvents(undefined)).toEqual([]);
    expect(parseFeishuEvents({})).toEqual([]);
    expect(parseFeishuEvents({ header: { event_type: "im.message.receive_v1" } })).toEqual([]);
    expect(parseFeishuEvents("not json")).toEqual([]);
    expect(parseFeishuEvents(42)).toEqual([]);
  });

  it("drops only the malformed elements, keeps the valid ones", () => {
    const out = parseFeishuEvents([userEvent(), { junk: true }, groupEvent()]);
    expect(out.map((m) => m.id)).toEqual(["om_1", "om_2"]);
  });
});

describe("buildFeishuMessage", () => {
  it("builds {receive_id, msg_type:'text', content} keyed by chatId with JSON-string content", () => {
    expect(buildFeishuMessage("oc_dm", "hello")).toEqual({
      receive_id: "oc_dm",
      msg_type: "text",
      content: JSON.stringify({ text: "hello" }),
    });
  });

  it("JSON-encodes the text inside content (newlines survive as escaped \\n)", () => {
    const body = buildFeishuMessage("oc_team", "line1\nline2");
    expect(JSON.parse(body.content)).toEqual({ text: "line1\nline2" });
    expect(body.content).toContain("\\n"); // the wire string carries an escaped newline
  });

  it("control-strips the outbound text (keeping newlines/tabs) before encoding", () => {
    const body = buildFeishuMessage("oc_dm", "a\x00b\x1b\tc\nd");
    expect(JSON.parse(body.content)).toEqual({ text: "ab\tc\nd" });
  });

  it("truncates over-budget text to the per-message cap before encoding", () => {
    const body = buildFeishuMessage("oc_dm", "z".repeat(5000));
    expect((JSON.parse(body.content) as { text: string }).text.length).toBe(4000);
  });
});

describe("parseFeishuAllowlist", () => {
  it("parses a comma list of chat/sender open-ids", () => {
    expect(
      parseFeishuAllowlist({ VANTA_FEISHU_ALLOWLIST: "ou_alice, oc_team ,ou_bob" } as NodeJS.ProcessEnv),
    ).toEqual(new Set(["ou_alice", "oc_team", "ou_bob"]));
  });

  it("empty/absent → empty set (the adapter reads this as allow-all)", () => {
    expect(parseFeishuAllowlist({ VANTA_FEISHU_ALLOWLIST: "" } as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseFeishuAllowlist({} as NodeJS.ProcessEnv)).toEqual(new Set());
    expect(parseFeishuAllowlist({ VANTA_FEISHU_ALLOWLIST: " , ," } as NodeJS.ProcessEnv)).toEqual(new Set());
  });
});

describe("feishuEnabled", () => {
  it("true only when BOTH app id + secret are present + non-blank", () => {
    expect(
      feishuEnabled({ VANTA_FEISHU_APP_ID: "cli_x", VANTA_FEISHU_APP_SECRET: "sec" } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("false when either credential is absent or blank (not configured = disabled)", () => {
    expect(feishuEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(feishuEnabled({ VANTA_FEISHU_APP_ID: "cli_x" } as NodeJS.ProcessEnv)).toBe(false);
    expect(feishuEnabled({ VANTA_FEISHU_APP_SECRET: "sec" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      feishuEnabled({ VANTA_FEISHU_APP_ID: "  ", VANTA_FEISHU_APP_SECRET: "sec" } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      feishuEnabled({ VANTA_FEISHU_APP_ID: "cli_x", VANTA_FEISHU_APP_SECRET: "  " } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("stripControl", () => {
  it("removes C0/C1 + DEL control chars but keeps \\n and \\t", () => {
    expect(stripControl("a\x00b\x1b\x7f\tc\nd")).toBe("ab\tc\nd");
  });
});

/** An injected fake transport recording sends; no real network. */
function fakeTransport(pollResult: unknown): {
  transport: FeishuTransport;
  sends: Array<unknown>;
} {
  const sends: Array<unknown> = [];
  const transport: FeishuTransport = {
    poll: async () => pollResult,
    send: async (body) => {
      sends.push(body);
    },
  };
  return { transport, sends };
}

describe("FeishuAdapter (injected transport — no real Feishu API)", () => {
  it("polls via the injected transport and parses inbound messages", async () => {
    const { transport } = fakeTransport(userEvent());
    const adapter = new FeishuAdapter({ transport });
    expect(adapter.id).toBe("feishu");
    const inbound = await adapter.poll();
    expect(inbound).toEqual([{ chatId: "oc_dm", from: "ou_alice", text: "hi", id: "om_1", isGroup: false }]);
  });

  it("returns [] (never throws) when the transport poll rejects", async () => {
    const transport: FeishuTransport = {
      poll: async () => {
        throw new Error("network down");
      },
      send: async () => {},
    };
    const adapter = new FeishuAdapter({ transport });
    await expect(adapter.poll()).resolves.toEqual([]);
  });

  it("filters inbound by the allowlist (chatId OR sender id)", async () => {
    const { transport } = fakeTransport([
      userEvent(),
      withEvent({
        sender: { sender_id: { open_id: "ou_zed" }, sender_type: "user" },
        message: {
          message_id: "om_z",
          chat_id: "oc_other",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "no" }),
        },
      }),
    ]);
    const adapter = new FeishuAdapter({ transport, allow: new Set(["ou_alice"]) });
    const inbound = await adapter.poll();
    expect(inbound.map((m) => m.id)).toEqual(["om_1"]);
  });

  it("sends a {receive_id, msg_type, content} body keyed by chatId", async () => {
    const { transport, sends } = fakeTransport(null);
    const adapter = new FeishuAdapter({ transport });
    const out: OutboundMessage = { chatId: "oc_dm", text: "reply" };
    await adapter.send(out);
    expect(sends).toEqual([
      { receive_id: "oc_dm", msg_type: "text", content: JSON.stringify({ text: "reply" }) },
    ]);
  });

  it("degrades markdown to plain text on send (no literal ** or fences)", async () => {
    const { transport, sends } = fakeTransport(null);
    const adapter = new FeishuAdapter({ transport });
    await adapter.send({ chatId: "oc_dm", text: "**bold** and _italic_" });
    const body = sends[0] as { content: string };
    expect((JSON.parse(body.content) as { text: string }).text).toBe("bold and italic");
  });

  it("splits an over-budget reply into multiple sends (each a valid body within the cap)", async () => {
    const { transport, sends } = fakeTransport(null);
    const adapter = new FeishuAdapter({ transport });
    await adapter.send({ chatId: "oc_team", text: "z".repeat(9000) });
    expect(sends.length).toBeGreaterThan(1);
    let total = 0;
    for (const body of sends) {
      const b = body as { receive_id: string; content: string };
      expect(b.receive_id).toBe("oc_team");
      const text = (JSON.parse(b.content) as { text: string }).text;
      expect(text.length).toBeLessThanOrEqual(4000);
      total += text.length;
    }
    expect(total).toBe(9000);
  });

  it("does not throw through the loop when a send rejects (errors-as-values)", async () => {
    const transport: FeishuTransport = {
      poll: async () => null,
      send: async () => {
        throw new Error("send failed");
      },
    };
    const adapter = new FeishuAdapter({ transport });
    await expect(adapter.send({ chatId: "oc_dm", text: "reply" })).resolves.toBeUndefined();
  });

  it("connect/disconnect are no-ops (stateless REST)", async () => {
    const { transport } = fakeTransport(null);
    const adapter = new FeishuAdapter({ transport });
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });
});
