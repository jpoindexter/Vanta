import type { StreamChunk, CompletionResult } from "../providers/interface.js";
import type { ToolCall } from "../types.js";

// Streaming tool execution: the agent loop starts a concurrency-safe tool the
// moment its tool-call block finishes streaming (a `tool_call` chunk), overlapping
// execution with the model still generating later blocks. Writes / shell / exec
// never prefetch — they may need approval and must run in deterministic order.

/** Side-effect-free reads that are safe to start mid-stream and run concurrently. */
export const CONCURRENCY_SAFE_TOOLS = new Set<string>([
  "read_file",
  "grep_files",
  "glob_files",
  "inspect_state",
  "recall",
  "web_search",
  "web_fetch",
  "lsp_diagnostics",
  "lsp_definition",
  "git_status",
  "git_diff",
  "ref_search",
  "graph_query",
  "tool_search",
]);

export function isConcurrencySafe(name: string): boolean {
  return CONCURRENCY_SAFE_TOOLS.has(name);
}

/**
 * Consume a provider stream: forward text deltas, hand each completed
 * concurrency-safe tool block to `onSafeToolCall` so the caller can start it
 * early, and return the assembled final result — or null if the stream produced
 * no `done` chunk (the caller then falls back to complete()). Throws AbortError
 * if the signal trips mid-stream.
 */
export async function consumeStream(opts: {
  stream: AsyncIterable<StreamChunk>;
  onTextDelta: (delta: string) => void;
  signal?: AbortSignal;
  onSafeToolCall?: (call: ToolCall) => void;
  onThinkingDelta?: (delta: string) => void;
}): Promise<CompletionResult | null> {
  let result: CompletionResult | null = null;
  for await (const chunk of opts.stream) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (chunk.type === "text") {
      opts.onTextDelta(chunk.delta);
    } else if (chunk.type === "thinking") {
      opts.onThinkingDelta?.(chunk.delta);
    } else if (chunk.type === "tool_call") {
      if (opts.onSafeToolCall && isConcurrencySafe(chunk.call.name)) opts.onSafeToolCall(chunk.call);
    } else {
      result = chunk.result;
    }
  }
  return result;
}
