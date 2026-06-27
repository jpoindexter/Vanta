import { describe, expect, it, vi } from "vitest";
import { toAnthropicMessages, parseResponse, promptCache1hEnabled, AnthropicProvider } from "./anthropic.js";
import type { Message } from "../types.js";
import type { ToolSchema, StreamChunk } from "./interface.js";

// Hoisted mock fns so the vi.mock factory can reference them.
const mockSdkCountTokens = vi.hoisted(() => vi.fn());
const mockSdkCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    constructor() {}
    messages = { countTokens: mockSdkCountTokens, create: mockSdkCreate };
  },
}));

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

describe("1-hour prompt cache", () => {
  const withSplit: Message[] = [
    { role: "system", content: "Stable rules.\n\n---\n\nActive goals: none\n\nSession started: now" },
  ];

  it("stamps the stable breakpoint with a 1h TTL when cache1h is on", () => {
    const result = toAnthropicMessages(withSplit, { cache1h: true });
    const blocks = result.system as Array<{ cache_control?: unknown }>;
    expect(blocks[0]?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    // The volatile tier is never cached, TTL or not.
    expect(blocks[1]?.cache_control).toBeUndefined();
  });

  it("defaults to the 5-minute TTL (no ttl field) when cache1h is off or unset", () => {
    const off = toAnthropicMessages(withSplit, { cache1h: false }).system as Array<{ cache_control?: unknown }>;
    const unset = toAnthropicMessages(withSplit).system as Array<{ cache_control?: unknown }>;
    expect(off[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(unset[0]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("promptCache1hEnabled reads the 1-hour-cache env name, truthy values only", () => {
    expect(promptCache1hEnabled({ ENABLE_PROMPT_CACHING_1H: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(promptCache1hEnabled({ ENABLE_PROMPT_CACHING_1H: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(promptCache1hEnabled({ ENABLE_PROMPT_CACHING_1H: "yes" } as NodeJS.ProcessEnv)).toBe(true);
    expect(promptCache1hEnabled({ ENABLE_PROMPT_CACHING_1H: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(promptCache1hEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("AnthropicProvider.countTokens", () => {
  const msgs: Message[] = [{ role: "user", content: "hello" }];
  const tools: ToolSchema[] = [{ name: "shell", description: "run a command", parameters: {} }];

  it("returns exact count from SDK", async () => {
    mockSdkCountTokens.mockResolvedValueOnce({ input_tokens: 1234 });
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    expect(await provider.countTokens(msgs, tools)).toBe(1234);
  });

  it("falls back to char estimate when SDK throws", async () => {
    mockSdkCountTokens.mockRejectedValueOnce(new Error("network error"));
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const estimate = Math.round(JSON.stringify(msgs).length / 4);
    expect(await provider.countTokens(msgs, tools)).toBe(estimate);
  });

  it("falls back to char estimate when SDK returns no input_tokens", async () => {
    mockSdkCountTokens.mockResolvedValueOnce({});
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    expect(await provider.countTokens(msgs, [])).toBe(0);
  });
});

describe("AnthropicProvider.stream", () => {
  async function* fakeEvents() {
    yield { type: "message_start", message: { usage: { input_tokens: 5, output_tokens: 0 } } };
    yield { type: "content_block_start", index: 0, content_block: { type: "thinking" } };
    yield { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } };
    yield { type: "content_block_stop", index: 0 };
    yield { type: "content_block_start", index: 1, content_block: { type: "text" } };
    yield { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "hi" } };
    yield { type: "content_block_stop", index: 1 };
    yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } };
  }

  it("requests a stream and yields live thinking + text chunks, then done", async () => {
    mockSdkCreate.mockReturnValueOnce(fakeEvents());
    const provider = new AnthropicProvider({ apiKey: "test-key" });
    const chunks: StreamChunk[] = [];
    for await (const c of provider.stream!([{ role: "user", content: "hi" }], [])) chunks.push(c);
    expect(mockSdkCreate).toHaveBeenCalled();
    expect((mockSdkCreate.mock.calls[0]?.[0] as { stream?: boolean }).stream).toBe(true);
    const d = (t: "text" | "thinking") => chunks.filter((c) => c.type === t).map((c) => (c as { delta: string }).delta);
    expect(d("thinking")).toEqual(["hmm"]);
    expect(d("text")).toEqual(["hi"]);
    const done = chunks.at(-1) as Extract<StreamChunk, { type: "done" }>;
    expect(done.type).toBe("done");
    expect(done.result.text).toBe("hi");
    expect(done.result.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });
});
