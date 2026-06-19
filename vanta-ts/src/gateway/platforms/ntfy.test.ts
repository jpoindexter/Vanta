import { describe, it, expect } from "vitest";
import { parseNtfyMessages, parseTopicAllowlist } from "./ntfy.js";

describe("parseNtfyMessages", () => {
  it("extracts message events and advances the cursor to the last id", () => {
    const body = [
      JSON.stringify({ id: "a1", time: 1, event: "open", topic: "vanta" }),
      JSON.stringify({ id: "a2", time: 2, event: "message", topic: "vanta", message: "hello" }),
      JSON.stringify({ id: "a3", time: 3, event: "message", topic: "vanta", message: "again" }),
    ].join("\n");
    const { messages, lastId } = parseNtfyMessages(body, "");
    expect(messages).toEqual([
      { chatId: "vanta", text: "hello", from: "vanta" },
      { chatId: "vanta", text: "again", from: "vanta" },
    ]);
    expect(lastId).toBe("a3");
  });

  it("prefixes the title onto the body when present", () => {
    const body = JSON.stringify({ id: "t1", time: 1, event: "message", topic: "vanta", title: "Alert", message: "disk full" });
    const { messages } = parseNtfyMessages(body, "");
    expect(messages).toEqual([{ chatId: "vanta", text: "Alert: disk full", from: "vanta" }]);
  });

  it("skips control events (open/keepalive/poll_request) but still advances the cursor", () => {
    const body = [
      JSON.stringify({ id: "k1", time: 1, event: "keepalive", topic: "vanta" }),
      JSON.stringify({ id: "k2", time: 2, event: "poll_request", topic: "vanta" }),
    ].join("\n");
    const { messages, lastId } = parseNtfyMessages(body, "old");
    expect(messages).toEqual([]);
    expect(lastId).toBe("k2");
  });

  it("skips message events with no usable text", () => {
    const body = [
      JSON.stringify({ id: "e1", time: 1, event: "message", topic: "vanta" }),
      JSON.stringify({ id: "e2", time: 2, event: "message", topic: "vanta", message: "   " }),
    ].join("\n");
    const { messages, lastId } = parseNtfyMessages(body, "");
    expect(messages).toEqual([]);
    expect(lastId).toBe("e2");
  });

  it("ignores malformed lines and blank lines, keeping the prior cursor when empty", () => {
    expect(parseNtfyMessages("", "z9")).toEqual({ messages: [], lastId: "z9" });
    const body = ["not json", "", "{ broken", JSON.stringify({ id: "g1", event: "message", topic: "vanta", message: "ok" })].join("\n");
    const { messages, lastId } = parseNtfyMessages(body, "z9");
    expect(messages).toEqual([{ chatId: "vanta", text: "ok", from: "vanta" }]);
    expect(lastId).toBe("g1");
  });
});

describe("parseTopicAllowlist", () => {
  it("parses a comma list of topics, trimming and dropping empties", () => {
    expect(parseTopicAllowlist(" vanta, ops ,")).toEqual(new Set(["vanta", "ops"]));
  });
  it("is empty (allow-all) for undefined", () => {
    expect(parseTopicAllowlist(undefined).size).toBe(0);
  });
});
