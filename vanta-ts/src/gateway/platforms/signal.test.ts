import { describe, it, expect } from "vitest";
import { parseSignalEvent, parseSignalSentId, buildSendPayload } from "./signal.js";

describe("parseSignalEvent", () => {
  it("returns null for invalid JSON", () => {
    expect(parseSignalEvent("not json")).toBeNull();
  });

  it("returns null for empty message", () => {
    const event = JSON.stringify({ envelope: { source: "+1", dataMessage: { message: "" } } });
    expect(parseSignalEvent(event)).toBeNull();
  });

  it("returns null when no dataMessage", () => {
    const event = JSON.stringify({ envelope: { source: "+1" } });
    expect(parseSignalEvent(event)).toBeNull();
  });

  it("parses a valid signal event", () => {
    const event = JSON.stringify({
      envelope: { source: "+15551234567", dataMessage: { message: "hello from signal" } },
    });
    const msg = parseSignalEvent(event);
    expect(msg?.chatId).toBe("+15551234567");
    expect(msg?.text).toBe("hello from signal");
  });

  it("leaves id/isGroup/replyToId undefined for a plain 1:1 message", () => {
    const event = JSON.stringify({
      envelope: { source: "+1", dataMessage: { message: "hi" } },
    });
    const msg = parseSignalEvent(event);
    expect(msg?.id).toBeUndefined();
    expect(msg?.isGroup).toBeUndefined();
    expect(msg?.replyToId).toBeUndefined();
  });

  it("populates id from the envelope timestamp", () => {
    const event = JSON.stringify({
      envelope: { source: "+1", timestamp: 1700000000123, dataMessage: { message: "hi" } },
    });
    expect(parseSignalEvent(event)?.id).toBe("1700000000123");
  });

  it("flags a group and uses the groupId as the chatId (reply target)", () => {
    const event = JSON.stringify({
      envelope: {
        source: "+15551234567",
        timestamp: 42,
        dataMessage: { message: "in a group", groupInfo: { groupId: "GROUP_B64" } },
      },
    });
    const msg = parseSignalEvent(event);
    expect(msg?.isGroup).toBe(true);
    expect(msg?.chatId).toBe("GROUP_B64");
    expect(msg?.id).toBe("42");
  });

  it("populates replyToId from a quote's referenced timestamp", () => {
    const event = JSON.stringify({
      envelope: {
        source: "+1",
        timestamp: 200,
        dataMessage: { message: "replying", quote: { id: 100 } },
      },
    });
    const msg = parseSignalEvent(event);
    expect(msg?.replyToId).toBe("100");
    expect(msg?.id).toBe("200");
  });
});

describe("parseSignalSentId", () => {
  it("extracts the sent message timestamp as the id", () => {
    expect(parseSignalSentId({ result: { timestamp: 1700000000999 } })).toBe("1700000000999");
  });
  it("returns undefined for a malformed or resultless response", () => {
    expect(parseSignalSentId({ error: { code: -1 } })).toBeUndefined();
    expect(parseSignalSentId("garbage")).toBeUndefined();
    expect(parseSignalSentId(undefined)).toBeUndefined();
  });
});

describe("buildSendPayload", () => {
  it("builds a valid JSON-RPC payload", () => {
    const payload = JSON.parse(buildSendPayload("+1111", "+2222", "hi"));
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.method).toBe("send");
    expect(payload.params.message).toBe("hi");
    expect(payload.params.recipient).toContain("+2222");
  });
});
