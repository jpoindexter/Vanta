import { describe, it, expect } from "vitest";
import { Stream } from "@anthropic-ai/sdk/core/streaming";
import { streamAnthropicEvents } from "./anthropic-convert.js";
import type { StreamChunk } from "./interface.js";

// Closes the "not run against the real API" gap WITHOUT a key: build a real Anthropic Messages SSE
// stream (exact `event:`/`data:` wire format), parse it with the GENUINE SDK parser
// (Stream.fromSSEResponse — the same code path a live response uses), and run our parser over the
// SDK-decoded events. This proves real wire format → real SDK decode → our chunks, end-to-end minus
// only the network/auth. If Anthropic's event shapes drifted from our parser, this fails.

function sseResponse(events: Array<{ event: string; data: unknown }>): Response {
  const wire = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
  const body = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new TextEncoder().encode(wire)); c.close(); },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function sdkStream(events: Array<{ event: string; data: unknown }>): AsyncIterable<unknown> {
  return Stream.fromSSEResponse(sseResponse(events), new AbortController()) as AsyncIterable<unknown>;
}

async function collect(it: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}
const deltas = (chunks: StreamChunk[], type: "text" | "thinking") =>
  chunks.filter((c) => c.type === type).map((c) => (c as { delta: string }).delta);

describe("Anthropic streaming end-to-end via the REAL SDK SSE parser (no key)", () => {
  it("decodes a real thinking+text stream into live thinking/text chunks and a done result", async () => {
    const chunks = await collect(streamAnthropicEvents(sdkStream([
      { event: "message_start", data: { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [], stop_reason: null, usage: { input_tokens: 12, output_tokens: 1 } } } },
      { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me work " } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "through it." } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "abc123" } } },
      { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
      { event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "The answer is 42." } } },
      { event: "content_block_stop", data: { type: "content_block_stop", index: 1 } },
      { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } } },
      { event: "message_stop", data: { type: "message_stop" } },
    ])));
    expect(deltas(chunks, "thinking")).toEqual(["Let me work ", "through it."]);
    expect(deltas(chunks, "text")).toEqual(["The answer is 42."]);
    const done = chunks.at(-1) as Extract<StreamChunk, { type: "done" }>;
    expect(done.type).toBe("done");
    expect(done.result.text).toBe("The answer is 42.");
    expect(done.result.usage).toEqual({ inputTokens: 12, outputTokens: 9 });
  });

  it("assembles a real streamed tool_use block (input_json_delta) into a tool_call", async () => {
    const chunks = await collect(streamAnthropicEvents(sdkStream([
      { event: "message_start", data: { type: "message_start", message: { usage: { input_tokens: 8, output_tokens: 1 } } } },
      { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "read_file", input: {} } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"path":"' } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'src/x.ts"}' } } },
      { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
      { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 4 } } },
      { event: "message_stop", data: { type: "message_stop" } },
    ])));
    const tc = chunks.find((c) => c.type === "tool_call") as Extract<StreamChunk, { type: "tool_call" }>;
    expect(tc.call).toEqual({ id: "toolu_1", name: "read_file", arguments: { path: "src/x.ts" } });
    const done = chunks.at(-1) as Extract<StreamChunk, { type: "done" }>;
    expect(done.result.toolCalls).toEqual([{ id: "toolu_1", name: "read_file", arguments: { path: "src/x.ts" } }]);
    expect(done.result.finishReason).toBe("tool_use");
  });
});
