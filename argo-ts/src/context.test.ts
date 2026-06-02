import { describe, it, expect } from "vitest";
import { estimateTokens, trimMessages } from "./context.js";
import type { Message } from "./types.js";

describe("trimMessages", () => {
  it("returns messages unchanged when under threshold", () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ];
    expect(trimMessages(msgs, 100_000)).toEqual(msgs);
  });

  it("trims the middle but keeps system, head, and tail", () => {
    const msgs: Message[] = [{ role: "system", content: "sys" }];
    for (let i = 0; i < 40; i++) {
      msgs.push({ role: "user", content: `message ${i} `.repeat(50) });
    }
    const trimmed = trimMessages(msgs, 1000, { protectFirst: 3, protectLast: 6 });
    expect(trimmed.length).toBeLessThan(msgs.length);
    expect(trimmed[0]).toEqual({ role: "system", content: "sys" });
    expect(trimmed.some((m) => m.content.includes("trimmed to fit"))).toBe(true);
  });

  it("does not start the tail on an orphaned tool result", () => {
    const msgs: Message[] = [{ role: "system", content: "s" }];
    for (let i = 0; i < 20; i++) {
      msgs.push({ role: "assistant", content: "x".repeat(400) });
    }
    msgs.push({ role: "tool", toolCallId: "t1", name: "read_file", content: "y".repeat(400) });
    const trimmed = trimMessages(msgs, 500, { protectFirst: 2, protectLast: 1 });
    const firstNonSystem = trimmed.find((m) => m.role !== "system" && !m.content.includes("trimmed"));
    expect(firstNonSystem?.role).not.toBe("tool");
  });

  it("estimateTokens grows with content", () => {
    const small = estimateTokens([{ role: "user", content: "hi" }]);
    const big = estimateTokens([{ role: "user", content: "x".repeat(4000) }]);
    expect(big).toBeGreaterThan(small);
  });
});
