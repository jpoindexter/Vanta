import { describe, expect, it } from "vitest";
import { toAnthropicMessages, parseResponse } from "./anthropic.js";
import type { Message } from "../types.js";

describe("parseResponse", () => {
  it("extracts text blocks", () => {
    const r = parseResponse([{ type: "text", text: "hello" }], "end_turn");
    expect(r.text).toBe("hello");
    expect(r.thinking).toBeUndefined();
  });

  it("extracts thinking blocks into result.thinking", () => {
    const r = parseResponse(
      [{ type: "thinking", thinking: "Let me analyze..." }, { type: "text", text: "Done." }],
      "end_turn",
    );
    expect(r.thinking).toBe("Let me analyze...");
    expect(r.text).toBe("Done.");
  });

  it("joins multiple thinking blocks with newline", () => {
    const r = parseResponse(
      [{ type: "thinking", thinking: "Part 1" }, { type: "thinking", thinking: "Part 2" }],
      "end_turn",
    );
    expect(r.thinking).toBe("Part 1\nPart 2");
  });

  it("omits thinking when no thinking blocks present", () => {
    const r = parseResponse([{ type: "text", text: "hi" }], "end_turn");
    expect(r.thinking).toBeUndefined();
  });
});

describe("toAnthropicMessages", () => {
  it("extracts system, builds tool_use and tool_result blocks for a full sequence", () => {
    const messages: Message[] = [
      { role: "system", content: "You are Vanta." },
      { role: "user", content: "List the files." },
      {
        role: "assistant",
        content: "Listing now.",
        toolCalls: [
          { id: "tc_1", name: "shell", arguments: { cmd: "ls" } },
        ],
      },
      { role: "tool", toolCallId: "tc_1", name: "shell", content: "a.ts\nb.ts" },
    ];

    const result = toAnthropicMessages(messages);

    expect(result.system).toBe("You are Vanta.");
    expect(result.messages).toEqual([
      { role: "user", content: "List the files." },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Listing now." },
          { type: "tool_use", id: "tc_1", name: "shell", input: { cmd: "ls" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tc_1", content: "a.ts\nb.ts" },
        ],
      },
    ]);
  });

  it("concatenates multiple system messages with blank lines", () => {
    const messages: Message[] = [
      { role: "system", content: "Rule one." },
      { role: "system", content: "Rule two." },
    ];

    const result = toAnthropicMessages(messages);

    expect(result.system).toBe("Rule one.\n\nRule two.");
    expect(result.messages).toEqual([]);
  });

  it("emits a plain assistant message when there are no tool calls", () => {
    const messages: Message[] = [
      { role: "assistant", content: "Done." },
    ];

    const result = toAnthropicMessages(messages);

    expect(result.messages).toEqual([{ role: "assistant", content: "Done." }]);
  });

  it("omits the text block for a tool-only assistant turn with empty content", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc_9", name: "read", arguments: { path: "x" } }],
      },
    ];

    const result = toAnthropicMessages(messages);

    expect(result.messages).toEqual([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tc_9", name: "read", input: { path: "x" } },
        ],
      },
    ]);
  });

  it("returns system as plain string when there is no tier separator", () => {
    const messages: Message[] = [{ role: "system", content: "You are Vanta." }];
    const result = toAnthropicMessages(messages);
    expect(typeof result.system).toBe("string");
    expect(result.system).toBe("You are Vanta.");
  });

  it("applies cache_control to the stable prefix when system contains the tier separator", () => {
    const messages: Message[] = [
      {
        role: "system",
        content: "Stable rules and tools.\n\n---\n\nActive goals:\n- [1] Ship v1\n\nSession started: 2026-06-04T00:00:00Z",
      },
    ];
    const result = toAnthropicMessages(messages);
    expect(Array.isArray(result.system)).toBe(true);
    const blocks = result.system as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(blocks).toHaveLength(2);
    const [stable, volatile] = blocks;
    if (!stable || !volatile) throw new Error("expected 2 blocks");
    expect(stable.text).toBe("Stable rules and tools.");
    expect(stable.cache_control).toEqual({ type: "ephemeral" });
    expect(volatile.text).toBe("Active goals:\n- [1] Ship v1\n\nSession started: 2026-06-04T00:00:00Z");
    expect(volatile.cache_control).toBeUndefined();
  });

  it("splits only on the LAST tier separator so middle tiers remain in stable", () => {
    const messages: Message[] = [
      {
        role: "system",
        content: "soul\n\n---\n\nbrain\n\n---\n\nActive goals: none\n\nSession started: now",
      },
    ];
    const result = toAnthropicMessages(messages);
    const blocks = result.system as Array<{ type: string; text: string; cache_control?: unknown }>;
    const [stable, volatile] = blocks;
    if (!stable || !volatile) throw new Error("expected 2 blocks");
    expect(stable.text).toBe("soul\n\n---\n\nbrain");
    expect(stable.cache_control).toEqual({ type: "ephemeral" });
    expect(volatile.text).toBe("Active goals: none\n\nSession started: now");
  });
});
