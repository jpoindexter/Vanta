import { describe, it, expect } from "vitest";
import { lastIntent, lastToolCalls, where } from "./where.js";
import type { Message } from "../types.js";
import type { ReplCtx } from "./types.js";

function makeCtx(messages: Message[]): ReplCtx {
  return { convo: { messages } } as unknown as ReplCtx;
}

describe("lastIntent", () => {
  it("returns the last non-empty user message", () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "build the feature" },
      { role: "assistant", content: "ok" },
    ];
    expect(lastIntent(msgs)).toBe("build the feature");
  });

  it("returns empty string when no user messages", () => {
    expect(lastIntent([{ role: "system", content: "sys" }])).toBe("");
  });

  it("skips empty user messages and returns the last non-empty one", () => {
    const msgs: Message[] = [
      { role: "user", content: "first intent" },
      { role: "user", content: "   " },
    ];
    expect(lastIntent(msgs)).toBe("first intent");
  });
});

describe("lastToolCalls", () => {
  it("returns tool call names in chronological order", () => {
    const msgs: Message[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "1", name: "read_file", arguments: {} }] },
      { role: "tool", toolCallId: "1", name: "read_file", content: "ok" },
      { role: "assistant", content: "", toolCalls: [{ id: "2", name: "write_file", arguments: {} }] },
    ];
    expect(lastToolCalls(msgs, 5)).toEqual(["read_file", "write_file"]);
  });

  it("limits to N most recent, scanning from the end", () => {
    const msgs: Message[] = [];
    for (let i = 0; i < 8; i++) {
      msgs.push({ role: "assistant", content: "", toolCalls: [{ id: String(i), name: `tool_${i}`, arguments: {} }] });
    }
    const result = lastToolCalls(msgs, 3);
    expect(result).toHaveLength(3);
    expect(result[2]).toBe("tool_7");
    expect(result[0]).toBe("tool_5");
  });

  it("returns empty array when no tool calls exist", () => {
    const msgs: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(lastToolCalls(msgs, 5)).toEqual([]);
  });

  it("collects multiple calls from a single assistant message", () => {
    const msgs: Message[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "a", name: "alpha", arguments: {} },
          { id: "b", name: "beta", arguments: {} },
        ],
      },
    ];
    expect(lastToolCalls(msgs, 5)).toEqual(["alpha", "beta"]);
  });
});

describe("where handler", () => {
  it("shows last intent and recent tool calls", async () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "ship the feature" },
      { role: "assistant", content: "", toolCalls: [{ id: "1", name: "read_file", arguments: {} }] },
    ];
    const result = await where("", makeCtx(msgs));
    expect(result.output).toContain("ship the feature");
    expect(result.output).toContain("read_file");
  });

  it("shows (none) placeholders when history is empty", async () => {
    const result = await where("", makeCtx([{ role: "system", content: "sys" }]));
    expect(result.output).toContain("none");
  });

  it("truncates a long intent to 120 chars", async () => {
    const long = "x".repeat(200);
    const msgs: Message[] = [{ role: "user", content: long }];
    const result = await where("", makeCtx(msgs));
    expect(result.output!.length).toBeLessThan(long.length + 50);
  });
});
