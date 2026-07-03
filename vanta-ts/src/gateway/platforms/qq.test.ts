import { describe, it, expect } from "vitest";
import { QQAdapter, type QQTransport } from "./qq.js";
import { parseQQEvents, buildQQMessage, parseQQAllowlist, qqEnabled } from "./qq-parse.js";

const groupEvent = (over: Record<string, unknown> = {}) => ({
  op: 0,
  id: "EVENT_ID",
  t: "GROUP_AT_MESSAGE_CREATE",
  d: {
    id: "MSG123",
    content: " hello vanta",
    group_openid: "GRP1",
    author: { member_openid: "USER9" },
    ...over,
  },
});

describe("parseQQEvents", () => {
  it("maps a group @-message to an InboundMessage (trimmed, routed by group_openid)", () => {
    expect(parseQQEvents(groupEvent())).toEqual([
      { chatId: "GRP1", from: "USER9", text: "hello vanta", id: "MSG123", isGroup: true },
    ]);
  });

  it("skips a non-group event and unparseable garbage", () => {
    expect(parseQQEvents({ t: "C2C_MESSAGE_CREATE", d: { id: "x", content: "hi", group_openid: "" } })).toEqual([]);
    expect(parseQQEvents({ nope: 1 })).toEqual([]);
    expect(parseQQEvents(null)).toEqual([]);
  });

  it("drops an empty-content event and accepts a bare array", () => {
    expect(parseQQEvents(groupEvent({ content: "   " }))).toEqual([]);
    expect(parseQQEvents([groupEvent()]).length).toBe(1);
  });
});

describe("buildQQMessage", () => {
  it("builds a passive reply with msg_id + msg_seq when replying", () => {
    expect(buildQQMessage("hi", "MSG123", 2)).toEqual({ content: "hi", msg_type: 0, msg_id: "MSG123", msg_seq: 2 });
  });
  it("builds an active message (no msg_id/seq) when there is nothing to reply to", () => {
    expect(buildQQMessage("hi")).toEqual({ content: "hi", msg_type: 0 });
  });
});

describe("qqEnabled + allowlist", () => {
  it("is enabled only when both app credentials are present", () => {
    expect(qqEnabled({ VANTA_QQ_APP_ID: "a", VANTA_QQ_APP_SECRET: "b" } as NodeJS.ProcessEnv)).toBe(true);
    expect(qqEnabled({ VANTA_QQ_APP_ID: "a" } as NodeJS.ProcessEnv)).toBe(false);
  });
  it("parses a comma allowlist", () => {
    expect([...parseQQAllowlist({ VANTA_QQ_ALLOWLIST: "GRP1, USER9" } as NodeJS.ProcessEnv)]).toEqual(["GRP1", "USER9"]);
  });
});

describe("QQAdapter — passive reply", () => {
  function fakeTransport(inbound: unknown, sent: Array<{ chatId: string; body: unknown }>): QQTransport {
    return { poll: async () => inbound, send: async (chatId, body) => { sent.push({ chatId, body }); } };
  }

  it("replies passively to the group's last inbound msg_id with an incrementing msg_seq", async () => {
    const sent: Array<{ chatId: string; body: unknown }> = [];
    const a = new QQAdapter({ transport: fakeTransport(groupEvent(), sent) });

    const msgs = await a.poll(); // remembers MSG123 as the reply target for GRP1
    expect(msgs[0]?.chatId).toBe("GRP1");

    await a.send({ chatId: "GRP1", text: "x".repeat(4500) }); // long → splits into 2 parts
    expect(sent).toHaveLength(2);
    expect(sent.map((s) => (s.body as { msg_id?: string }).msg_id)).toEqual(["MSG123", "MSG123"]);
    expect(sent.map((s) => (s.body as { msg_seq?: number }).msg_seq)).toEqual([1, 2]); // unique per part
    expect(sent[0]?.chatId).toBe("GRP1");
  });

  it("filters to the allowlist and never throws on a failing send", async () => {
    const sent: Array<{ chatId: string; body: unknown }> = [];
    const a = new QQAdapter({ transport: { poll: async () => groupEvent(), send: async () => { throw new Error("boom"); } }, allow: new Set(["OTHER"]) });
    expect(await a.poll()).toEqual([]); // GRP1/USER9 not in allowlist
    await expect(a.send({ chatId: "GRP1", text: "hi" })).resolves.toBeUndefined(); // swallowed
    expect(sent).toHaveLength(0);
  });
});
