import { describe, it, expect } from "vitest";
import { streamAnthropicEvents } from "./anthropic-convert.js";
import type { StreamChunk } from "./interface.js";

async function* events(list: unknown[]): AsyncGenerator<unknown> {
  for (const e of list) yield e;
}
async function collect(it: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}
const deltas = (chunks: StreamChunk[], type: "text" | "thinking") =>
  chunks.filter((c) => c.type === type).map((c) => (c as { delta: string }).delta);

describe("streamAnthropicEvents — Anthropic SSE events → universal StreamChunks", () => {
  it("yields thinking deltas (thinking_delta) and text deltas (text_delta) in stream order", async () => {
    const chunks = await collect(streamAnthropicEvents(events([
      { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "let me " } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "think" } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "text" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "the answer" } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
      { type: "message_stop" },
    ])));
    expect(deltas(chunks, "thinking")).toEqual(["let me ", "think"]);
    expect(deltas(chunks, "text")).toEqual(["the answer"]);
    const done = chunks.at(-1) as Extract<StreamChunk, { type: "done" }>;
    expect(done.type).toBe("done");
    expect(done.result.text).toBe("the answer");
    expect(done.result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("assembles a streamed tool_use block into a tool_call chunk and the done result", async () => {
    const chunks = await collect(streamAnthropicEvents(events([
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "read_file" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"path":' } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"x.ts"}' } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 3 } },
    ])));
    const call = (chunks.find((c) => c.type === "tool_call") as Extract<StreamChunk, { type: "tool_call" }>).call;
    expect(call).toEqual({ id: "t1", name: "read_file", arguments: { path: "x.ts" } });
    const done = chunks.at(-1) as Extract<StreamChunk, { type: "done" }>;
    expect(done.result.toolCalls).toEqual([{ id: "t1", name: "read_file", arguments: { path: "x.ts" } }]);
    expect(done.result.finishReason).toBe("tool_use");
  });
});
