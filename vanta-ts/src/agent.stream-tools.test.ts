import { describe, it, expect } from "vitest";
import { createConversation } from "./agent.js";
import { ToolRegistry } from "./tools/registry.js";
import type { Tool } from "./tools/types.js";
import type { LLMProvider, CompletionResult, StreamChunk } from "./providers/interface.js";
import type { SafetyClient } from "./safety-client.js";
import type { ToolCall } from "./types.js";

// Streaming tool execution: a concurrency-safe tool must START while the model is
// still streaming the rest of the response. We prove that by making the provider
// WAIT (mid-stream, before the `done` chunk) until both reads have begun — if the
// loop only dispatched tools after `done`, this stream would deadlock and the test
// would time out. A pass is positive proof of overlap.

const fakeSafety = {
  assess: async () => ({ risk: "allow" as const, needsHuman: false, reason: "" }),
  logEvent: async () => {},
} as unknown as SafetyClient;

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const read1: ToolCall = { id: "r1", name: "read_file", arguments: { path: "a" } };
const read2: ToolCall = { id: "r2", name: "read_file", arguments: { path: "b" } };

describe("streaming tool execution", () => {
  it("starts concurrency-safe tools mid-stream, before the response completes", async () => {
    const startedPaths = new Set<string>();
    let execCount = 0;
    const bothStarted = deferred<void>();

    const readTool: Tool = {
      schema: { name: "read_file", description: "read a file", parameters: { type: "object", properties: { path: { type: "string" } } } },
      describeForSafety: () => "read a file",
      async execute(args) {
        execCount++;
        startedPaths.add(String((args as { path?: string }).path));
        if (startedPaths.has("a") && startedPaths.has("b")) bothStarted.resolve();
        return { ok: true, output: `contents of ${(args as { path?: string }).path}` };
      },
    };

    let streamCalls = 0;
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      async complete(): Promise<CompletionResult> {
        // Streaming path is used; complete() is the fallback and must not run here.
        return { text: "", toolCalls: [], finishReason: "stop" };
      },
      async *stream(): AsyncIterable<StreamChunk> {
        streamCalls++;
        if (streamCalls === 1) {
          // Two tool blocks arrive...
          yield { type: "tool_call", call: read1 };
          yield { type: "tool_call", call: read2 };
          // ...and the model "keeps generating": it won't finish until both reads
          // have already started. Prefetch is what unblocks this.
          await bothStarted.promise;
          yield { type: "done", result: { text: "", toolCalls: [read1, read2], finishReason: "tool_calls" } };
        } else {
          // Second turn: the model wraps up with plain text and no tools.
          yield { type: "done", result: { text: "done: read both", toolCalls: [], finishReason: "stop" } };
        }
      },
    };

    const registry = new ToolRegistry();
    registry.register(readTool);

    let completeCalls = 0;
    const wrapped: LLMProvider = { ...provider, complete: async (...a) => { completeCalls++; return provider.complete(...a); } };

    const convo = createConversation("sys", {
      provider: wrapped,
      safety: fakeSafety,
      registry,
      root: "/x",
      requestApproval: async () => true,
      onTextDelta: () => {}, // enables the streaming path
    });

    const outcome = await convo.send("read a and b");

    // Overlap proven: the stream only completed because both reads started mid-stream.
    expect(startedPaths.has("a") && startedPaths.has("b")).toBe(true);
    // Each tool executed exactly once — prefetch result is reused, not re-dispatched.
    expect(execCount).toBe(2);
    // Both tool results landed in the transcript, in order.
    const toolMsgs = convo.messages.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(2);
    expect(toolMsgs.map((m) => (m.role === "tool" ? m.toolCallId : ""))).toEqual(["r1", "r2"]);
    // The streaming path carried both turns; complete() never ran.
    expect(completeCalls).toBe(0);
    expect(outcome.finalText).toBe("done: read both");
  });
});
