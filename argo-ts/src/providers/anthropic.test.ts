import { describe, expect, it } from "vitest";
import { toAnthropicMessages } from "./anthropic.js";
import type { Message } from "../types.js";

describe("toAnthropicMessages", () => {
  it("extracts system, builds tool_use and tool_result blocks for a full sequence", () => {
    const messages: Message[] = [
      { role: "system", content: "You are Argo." },
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

    expect(result.system).toBe("You are Argo.");
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
});
