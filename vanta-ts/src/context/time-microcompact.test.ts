import { describe, it, expect } from "vitest";
import {
  clearStaleToolResults,
  resolveIdleConfig,
  DEFAULT_IDLE_MS,
  DEFAULT_KEEP_RECENT,
} from "./time-microcompact.js";
import type { Message } from "../types.js";

const STUB = "[old tool result cleared after idle]";

/** A transcript with `n` assistant→tool pairs around a leading system+user. */
function transcript(n: number): Message[] {
  const msgs: Message[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "go" },
  ];
  for (let i = 0; i < n; i++) {
    msgs.push({ role: "assistant", content: "", toolCalls: [{ id: `c${i}`, name: "read_file", arguments: {} }] });
    msgs.push({ role: "tool", toolCallId: `c${i}`, name: "read_file", content: `result ${i}` });
  }
  return msgs;
}

describe("clearStaleToolResults", () => {
  it("returns the same array unchanged when idle is under the threshold", () => {
    const msgs = transcript(6);
    const out = clearStaleToolResults(msgs, DEFAULT_IDLE_MS - 1);
    expect(out).toBe(msgs); // same reference — common path is a no-op
  });

  it("stubs old tool results and keeps the last N verbatim when idle exceeds the threshold", () => {
    const msgs = transcript(6); // 6 tool results
    const out = clearStaleToolResults(msgs, DEFAULT_IDLE_MS + 1);
    const toolMsgs = out.filter((m) => m.role === "tool");
    // First 2 stubbed, last DEFAULT_KEEP_RECENT (4) kept.
    expect(toolMsgs.slice(0, 2).every((m) => m.content === STUB)).toBe(true);
    expect(toolMsgs.slice(2).map((m) => m.content)).toEqual(["result 2", "result 3", "result 4", "result 5"]);
  });

  it("keeps non-tool messages intact and preserves tool_call/result positions", () => {
    const msgs = transcript(6);
    const out = clearStaleToolResults(msgs, DEFAULT_IDLE_MS + 1);
    expect(out.length).toBe(msgs.length); // no message removed
    expect(out.map((m) => m.role)).toEqual(msgs.map((m) => m.role)); // ordering preserved
    // Each tool result still sits right after its triggering assistant tool_call.
    for (let i = 0; i < out.length; i++) {
      const m = out[i]!;
      if (m.role === "tool") {
        const prev = out[i - 1]!;
        expect(prev.role).toBe("assistant");
        expect(prev.role === "assistant" && prev.toolCalls?.[0]?.id).toBe(m.toolCallId);
      }
    }
    // System + user content untouched.
    expect(out[0]).toEqual({ role: "system", content: "sys" });
    expect(out[1]).toEqual({ role: "user", content: "go" });
  });

  it("does not mutate the input array", () => {
    const msgs = transcript(6);
    const snapshot = JSON.parse(JSON.stringify(msgs));
    clearStaleToolResults(msgs, DEFAULT_IDLE_MS + 1);
    expect(msgs).toEqual(snapshot); // live transcript untouched
  });

  it("stubs ALL tool results when keepRecent is 0 (the slice(-0) trap)", () => {
    const msgs = transcript(3);
    const out = clearStaleToolResults(msgs, DEFAULT_IDLE_MS + 1, { keepRecent: 0 });
    expect(out.filter((m) => m.role === "tool").every((m) => m.content === STUB)).toBe(true);
  });

  it("honors a custom thresholdMs and keepRecent", () => {
    const msgs = transcript(4);
    const out = clearStaleToolResults(msgs, 1000, { thresholdMs: 500, keepRecent: 1 });
    const tools = out.filter((m) => m.role === "tool");
    expect(tools.slice(0, 3).every((m) => m.content === STUB)).toBe(true);
    expect(tools[3]!.content).toBe("result 3");
  });

  it("leaves everything verbatim when there are fewer tool results than keepRecent", () => {
    const msgs = transcript(2);
    const out = clearStaleToolResults(msgs, DEFAULT_IDLE_MS + 1, { keepRecent: 4 });
    expect(out.filter((m) => m.role === "tool").map((m) => m.content)).toEqual(["result 0", "result 1"]);
  });

  it("never throws on empty or tool-less input", () => {
    expect(clearStaleToolResults([], DEFAULT_IDLE_MS + 1)).toEqual([]);
    const noTools: Message[] = [
      { role: "system", content: "s" },
      { role: "user", content: "u" },
      { role: "assistant", content: "a" },
    ];
    expect(clearStaleToolResults(noTools, DEFAULT_IDLE_MS + 1)).toEqual(noTools);
  });

  it("treats NaN idle (first/resumed turn) as under-threshold — no compaction", () => {
    const msgs = transcript(6);
    expect(clearStaleToolResults(msgs, Number.NaN)).toBe(msgs);
  });
});

describe("resolveIdleConfig", () => {
  it("falls back to defaults when env is unset", () => {
    expect(resolveIdleConfig({})).toEqual({ thresholdMs: DEFAULT_IDLE_MS, keepRecent: DEFAULT_KEEP_RECENT });
  });

  it("reads VANTA_MICROCOMPACT_IDLE_MS and VANTA_MICROCOMPACT_KEEP", () => {
    const cfg = resolveIdleConfig({ VANTA_MICROCOMPACT_IDLE_MS: "5000", VANTA_MICROCOMPACT_KEEP: "2" });
    expect(cfg).toEqual({ thresholdMs: 5000, keepRecent: 2 });
  });

  it("ignores non-numeric or negative overrides, keeping the defaults", () => {
    const cfg = resolveIdleConfig({ VANTA_MICROCOMPACT_IDLE_MS: "abc", VANTA_MICROCOMPACT_KEEP: "-3" });
    expect(cfg).toEqual({ thresholdMs: DEFAULT_IDLE_MS, keepRecent: DEFAULT_KEEP_RECENT });
  });
});
