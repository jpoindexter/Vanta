import { Stream } from "@anthropic-ai/sdk/core/streaming";
import { describe, expect, it } from "vitest";
import { streamAnthropicEvents } from "./anthropic-convert.js";
import type { Usage } from "./interface.js";

async function usage(start: Record<string, unknown> | undefined, updates: Record<string, unknown>[]): Promise<Usage | undefined> {
  const events = [
    { type: "message_start", message: { usage: start } },
    ...updates.map(usage => ({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage })),
    { type: "message_stop" },
  ];
  const wire = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  const response = new Response(wire, { headers: { "content-type": "text/event-stream" } });
  const decoded = Stream.fromSSEResponse(response, new AbortController()) as AsyncIterable<unknown>;
  for await (const chunk of streamAnthropicEvents(decoded)) {
    if (chunk.type === "done") return chunk.result.usage;
  }
  throw new Error("Missing terminal result");
}

describe("Anthropic streaming cache usage through the real SDK SSE parser", () => {
  it("retains start cache reads through multiple cumulative output updates", async () => {
    expect(await usage({ input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 1000 }, [
      { output_tokens: 3 }, { output_tokens: 5 },
    ])).toEqual({ inputTokens: 10, outputTokens: 5, cacheTokens: 1000 });
  });

  it("retains an explicitly reported zero instead of treating it as missing", async () => {
    expect(await usage({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }, [
      { output_tokens: 0 },
    ])).toEqual({ inputTokens: 0, outputTokens: 0, cacheTokens: 0 });
  });

  it("accepts a cache-read update alongside final output usage", async () => {
    expect(await usage({ input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 100 }, [
      { output_tokens: 5, cache_read_input_tokens: 200 },
    ])).toEqual({ inputTokens: 10, outputTokens: 5, cacheTokens: 200 });
  });

  it("accepts cache-only deltas and preserves them through later output-only deltas", async () => {
    expect(await usage({ input_tokens: 10, output_tokens: 1 }, [
      { cache_read_input_tokens: 100 }, { output_tokens: 5 },
    ])).toEqual({ inputTokens: 10, outputTokens: 5, cacheTokens: 100 });
  });

  it("allows a later explicit zero to replace an earlier cache count", async () => {
    expect(await usage({ input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 100 }, [
      { cache_read_input_tokens: 0 }, { output_tokens: 5 },
    ])).toEqual({ inputTokens: 10, outputTokens: 5, cacheTokens: 0 });
  });

  it("keeps absent or null cache fields absent rather than inventing a cache hit", async () => {
    expect(await usage({ input_tokens: 10, output_tokens: 0 }, [
      { output_tokens: 5, cache_read_input_tokens: null },
    ])).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("does not erase reported cache reads when a later delta has a null cache field", async () => {
    expect(await usage({ input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 100 }, [
      { output_tokens: 5, cache_read_input_tokens: null },
    ])).toEqual({ inputTokens: 10, outputTokens: 5, cacheTokens: 100 });
  });

  it("does not invent usage when no event reports it", async () => {
    expect(await usage(undefined, [{}])).toBeUndefined();
  });

  it("does not mistake cache-creation tokens for cache reads", async () => {
    expect(await usage({ input_tokens: 10, output_tokens: 0, cache_creation_input_tokens: 200 }, [
      { output_tokens: 5 },
    ])).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("retains cache reads when initial usage was absent", async () => {
    expect(await usage(undefined, [{ output_tokens: 5, cache_read_input_tokens: 100 }]))
      .toEqual({ inputTokens: 0, outputTokens: 5, cacheTokens: 100 });
  });
});
