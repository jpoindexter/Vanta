import { describe, it, expect } from "vitest";
import {
  parseMessage,
  promptText,
  serializeError,
  serializeNotification,
  serializeRequest,
  serializeResult,
  InitializeParams,
  PromptParams,
  RPC,
} from "./protocol.js";

describe("parseMessage", () => {
  it("classifies a request with an id and method", () => {
    const msg = parseMessage(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    expect(msg).toEqual({ kind: "request", id: 1, method: "initialize", params: {} });
  });

  it("classifies a notification as one with a method and no id", () => {
    const msg = parseMessage(JSON.stringify({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "s1" } }));
    expect(msg).toEqual({ kind: "notification", method: "session/cancel", params: { sessionId: "s1" } });
  });

  it("classifies a success response as a response with a result", () => {
    const msg = parseMessage(JSON.stringify({ jsonrpc: "2.0", id: 9, result: { ok: true } }));
    expect(msg).toEqual({ kind: "response", id: 9, result: { ok: true }, error: undefined });
  });

  it("classifies an error response", () => {
    const msg = parseMessage(JSON.stringify({ jsonrpc: "2.0", id: 9, error: { code: -1, message: "x" } }));
    expect(msg.kind).toBe("response");
  });

  it("returns parse_error for malformed JSON without throwing", () => {
    const msg = parseMessage("{not json");
    expect(msg).toEqual({ kind: "parse_error", reason: "invalid JSON", id: null });
  });

  it("returns parse_error when a request is missing its method", () => {
    const msg = parseMessage(JSON.stringify({ jsonrpc: "2.0", id: 3 }));
    expect(msg).toEqual({ kind: "parse_error", reason: "missing method", id: 3 });
  });
});

describe("serializers", () => {
  it("serializeResult frames a success response with a trailing newline", () => {
    const line = serializeResult(1, { sessionId: "s1" });
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line.trim())).toEqual({ jsonrpc: "2.0", id: 1, result: { sessionId: "s1" } });
  });

  it("serializeError frames an error response and allows a null id", () => {
    const line = serializeError(null, RPC.PARSE_ERROR, "invalid JSON");
    expect(JSON.parse(line.trim())).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "invalid JSON" } });
  });

  it("serializeNotification frames a notification with no id", () => {
    const line = serializeNotification("session/update", { sessionId: "s1" });
    const parsed = JSON.parse(line.trim());
    expect(parsed.method).toBe("session/update");
    expect("id" in parsed).toBe(false);
  });

  it("serializeRequest frames an outbound request with an id and method", () => {
    const line = serializeRequest("perm-1", "session/request_permission", { sessionId: "s1" });
    const parsed = JSON.parse(line.trim());
    expect(parsed).toMatchObject({ jsonrpc: "2.0", id: "perm-1", method: "session/request_permission" });
  });
});

describe("zod method schemas", () => {
  it("InitializeParams defaults the protocol version when absent", () => {
    expect(InitializeParams.parse({}).protocolVersion).toBe(1);
  });

  it("PromptParams defaults prompt to an empty array", () => {
    expect(PromptParams.parse({ sessionId: "s1" }).prompt).toEqual([]);
  });

  it("PromptParams rejects a missing sessionId", () => {
    expect(PromptParams.safeParse({ prompt: [] }).success).toBe(false);
  });
});

describe("promptText", () => {
  it("flattens text content blocks and ignores non-text blocks", () => {
    const blocks = PromptParams.parse({
      sessionId: "s1",
      prompt: [
        { type: "text", text: "hello" },
        { type: "image", data: "..." },
        { type: "text", text: "world" },
      ],
    }).prompt;
    expect(promptText(blocks)).toBe("hello\nworld");
  });
});
