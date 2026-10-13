import { describe, expect, it } from "vitest";
import { approvalPayload, type PendingApproval } from "./approval.js";
import { runEventFromTool } from "../runs/store.js";
import {
  approvalRequestEvent, approvalResolvedEvent, parseTypedEvent, redactAndCapArgs, thinkingEvent,
  toolCompleteEvent, toolStartEvent, turnCompleteEvent, TypedDesktopEventSchema,
  THINKING_MAX_CHARS, TOOL_ARGS_MAX_BYTES, TOOL_OUTPUT_MAX_CHARS,
} from "./typed-events.js";

const pending: PendingApproval = {
  id: "1700000000000", action: "run shell command: ls -la", reason: "routine", toolName: "shell_cmd", resolve: () => undefined,
};

describe("typed desktop event schema", () => {
  it("accepts every event type in its documented shape", () => {
    const events = [
      { type: "tool.start", id: "tool-1", name: "read_file", args: { path: "a.ts" }, truncated: false },
      { type: "tool.complete", id: "tool-1", name: "read_file", ok: true, output: "ok", truncated: false },
      { type: "thinking", text: "hmm", truncated: false },
      { type: "approval.request", approval: JSON.parse(JSON.stringify(approvalPayload(pending))) },
      { type: "approval.resolved", id: "1700000000000" },
      { type: "turn.complete", sessionId: "s1", finalText: "done", usage: { inputTokens: 1, outputTokens: 2 }, stoppedReason: "done" },
      { type: "turn.complete", sessionId: "s1", finalText: "done" },
    ];
    for (const event of events) expect(TypedDesktopEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([
    ["unknown discriminator", { type: "tool.explode", id: "x" }],
    ["tool.start without id", { type: "tool.start", name: "a", args: {}, truncated: false }],
    ["tool.start with empty id", { type: "tool.start", id: "", name: "a", args: {}, truncated: false }],
    ["tool.start with non-record args", { type: "tool.start", id: "t", name: "a", args: "x", truncated: false }],
    ["tool.complete with non-boolean ok", { type: "tool.complete", id: "t", name: "a", ok: "yes", output: "", truncated: false }],
    ["approval.request with a bare string", { type: "approval.request", approval: "nope" }],
    ["turn.complete with bad usage", { type: "turn.complete", sessionId: "s", finalText: "", usage: { inputTokens: "1" } }],
    ["a non-object", "tool.start"],
  ])("rejects %s", (_label, value) => {
    expect(parseTypedEvent(value)).toBeNull();
  });

  it("builds approval.request carrying exactly what approvalPayload returns", () => {
    const event = approvalRequestEvent(approvalPayload(pending));
    expect(event).toEqual({ type: "approval.request", approval: JSON.parse(JSON.stringify(approvalPayload(pending))) });
    expect(approvalResolvedEvent("1700000000000")).toEqual({ type: "approval.resolved", id: "1700000000000" });
  });
});

describe("typed event redaction and caps", () => {
  it("redacts secret-bearing keys and secret values in tool args", () => {
    const event = toolStartEvent("tool-1", "http_request", {
      url: "https://x.test/hook?token=abc123def456", headers: { authorization: "Bearer abc" }, api_key: "plain-opaque", note: "keep me",
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("abc123def456");
    expect(serialized).not.toContain("plain-opaque");
    expect(event).toMatchObject({ type: "tool.start", args: { note: "keep me", api_key: "***" }, truncated: false });
  });

  it("redacts the same secret-bearing keys as the run-event recorder", () => {
    const keys = ["authorization", "Cookie", "access_token", "client_secret", "password", "passwd", "api-key", "apiKey", "credential", "path"];
    for (const key of keys) {
      const typed = redactAndCapArgs({ [key]: "value" }).args[key];
      const recorded = runEventFromTool({ type: "tool_start", name: "x", args: { [key]: "value" } }).args?.[key];
      expect(typed, key).toBe(recorded);
    }
  });

  it("redacts secrets in tool output and thinking text", () => {
    const secret = "sk-ant-api03-" + "a".repeat(40);
    expect(JSON.stringify(toolCompleteEvent("tool-1", "shell_cmd", true, `key=${secret}`))).not.toContain(secret);
    expect(JSON.stringify(thinkingEvent(`use ${secret}`))).not.toContain(secret);
  });

  it("shrinks oversized args under the byte cap and flags truncation", () => {
    const { args, truncated } = redactAndCapArgs({ content: "x".repeat(50_000), path: "big.txt" });
    expect(truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(args))).toBeLessThanOrEqual(TOOL_ARGS_MAX_BYTES);
    expect(args.path).toBe("big.txt");
  });

  it("drops trailing keys when many keys alone exceed the cap", () => {
    const wide = Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`key_${i}`, "v".repeat(300)]));
    const { args, truncated } = redactAndCapArgs(wide);
    expect(truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(args))).toBeLessThanOrEqual(TOOL_ARGS_MAX_BYTES);
    expect(Object.keys(args).length).toBeGreaterThan(0);
  });

  it("leaves small args untouched and unflagged", () => {
    expect(redactAndCapArgs({ path: "a.ts", n: 3 })).toEqual({ args: { path: "a.ts", n: 3 }, truncated: false });
  });

  it("caps tool output and thinking text and flags truncation", () => {
    const out = toolCompleteEvent("tool-2", "shell_cmd", false, "line of output\n".repeat(TOOL_OUTPUT_MAX_CHARS));
    expect(out).toMatchObject({ truncated: true });
    expect(out?.type === "tool.complete" && out.output.length).toBeLessThanOrEqual(TOOL_OUTPUT_MAX_CHARS);
    const think = thinkingEvent("think ".repeat(THINKING_MAX_CHARS));
    expect(think).toMatchObject({ type: "thinking", truncated: true });
    expect(toolCompleteEvent("tool-3", "x", true, "short")).toMatchObject({ output: "short", truncated: false });
  });

  it("passes final text and usage through unmodified on turn.complete", () => {
    const finalText = "z".repeat(100_000);
    const event = turnCompleteEvent({ sessionId: "s1", finalText, usage: { inputTokens: 3, outputTokens: 4 }, stoppedReason: "done" });
    expect(event).toEqual({ type: "turn.complete", sessionId: "s1", finalText, usage: { inputTokens: 3, outputTokens: 4 }, stoppedReason: "done" });
    expect(turnCompleteEvent({ sessionId: "s1", finalText: "x" })).toEqual({ type: "turn.complete", sessionId: "s1", finalText: "x" });
  });
});
