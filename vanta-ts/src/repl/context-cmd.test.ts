import { describe, it, expect } from "vitest";
import { contextBreakdown, formatContextBreakdown } from "./context-cmd.js";
import type { Message } from "../types.js";

const msgs: Message[] = [
  { role: "system", content: "x".repeat(400) }, // 100 tok
  { role: "user", content: "y".repeat(40) }, // 10 tok
  { role: "assistant", content: "z".repeat(40), toolCalls: [{ id: "1", name: "read_file", arguments: { path: "a" } }] },
  { role: "tool", toolCallId: "1", name: "read_file", content: "w".repeat(80) }, // 20 tok
];

describe("contextBreakdown (CC-CONTEXT-USAGE-CMD)", () => {
  it("sums tokens by message category at ~4 chars/token", () => {
    const b = contextBreakdown(msgs, 1000);
    expect(b.system).toBe(100);
    expect(b.user).toBe(10);
    expect(b.tool).toBe(20);
    expect(b.assistant).toBeGreaterThan(10); // content + serialized tool-call args
    expect(b.total).toBe(b.system + b.user + b.assistant + b.tool);
    expect(b.pct).toBe(Math.round((b.total / 1000) * 100));
  });

  it("never divides by zero for an unknown window", () => {
    const b = contextBreakdown(msgs, 0);
    expect(b.pct).toBe(0);
    expect(b.window).toBe(0);
  });
});

describe("formatContextBreakdown", () => {
  it("renders the lowercase header, a usage bar, and each category", () => {
    const out = formatContextBreakdown(contextBreakdown(msgs, 1000));
    expect(out).toContain("context");
    expect(out).toContain("system");
    expect(out).toContain("assistant");
    expect(out).toContain("tool results");
    expect(out).toContain("%");
  });
});
