import { describe, it, expect } from "vitest";
import { parseSignalEvent, buildSendPayload } from "./signal.js";

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
