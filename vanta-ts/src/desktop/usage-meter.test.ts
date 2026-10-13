import { describe, expect, it } from "vitest";
import type { Message } from "../types.js";
import { estimateContextTokens } from "./usage-meter.js";

describe("estimateContextTokens", () => {
  it("counts text and tool-call arguments at four characters per token", () => {
    const messages: Message[] = [
      { role: "user", content: "x".repeat(400) },
      { role: "assistant", content: "y".repeat(400), toolCalls: [{ id: "c", name: "read_file", arguments: { path: "a.ts" } }] },
      { role: "tool", toolCallId: "c", name: "read_file", content: "z".repeat(400) },
    ];
    const tokens = estimateContextTokens(messages);
    expect(tokens).toBeGreaterThan(300);
    expect(tokens).toBeLessThan(330);
  });

  it("leaves attached image bytes out so a screenshot does not swamp the meter", () => {
    const withImage: Message[] = [{ role: "user", content: "look", images: [{ mime: "image/png", dataBase64: "A".repeat(2_000_000) }] }];
    expect(estimateContextTokens(withImage)).toBe(1);
  });

  it("is zero for an empty conversation", () => {
    expect(estimateContextTokens([])).toBe(0);
  });
});
