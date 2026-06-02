import type { Message, ToolCall } from "../types.js";

/** A tool advertised to the model, in JSON-schema form. */
export type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type CompletionConfig = {
  temperature?: number;
  maxTokens?: number;
};

export type CompletionResult = {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string;
};

/**
 * A streaming chunk. `text` deltas arrive as the model generates; a single
 * `done` chunk carries the assembled CompletionResult (full text + tool calls)
 * so the agent loop can proceed exactly as the non-streaming path does.
 */
export type StreamChunk =
  | { type: "text"; delta: string }
  | { type: "done"; result: CompletionResult };

/**
 * An LLM backend. v0 is non-streaming: the agent loop waits for the full tool
 * call before executing anyway, so streaming only buys live text display —
 * deferred to keep v0 reliable. Streaming can be added behind this interface.
 */
export interface LLMProvider {
  complete(
    messages: Message[],
    tools: ToolSchema[],
    config?: CompletionConfig,
  ): Promise<CompletionResult>;
  modelId(): string;
  contextWindow(): number;
  /**
   * Optional token streaming. When present, the agent loop consumes it to emit
   * live text deltas (the TUI / REPL renders them as they arrive). Yields `text`
   * chunks then exactly one `done` chunk. Providers without it fall back to
   * `complete()`.
   */
  stream?(
    messages: Message[],
    tools: ToolSchema[],
    config?: CompletionConfig,
  ): AsyncIterable<StreamChunk>;
}
