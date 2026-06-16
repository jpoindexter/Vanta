import type { EffortLevel, Message, ToolCall } from "../types.js";

/** A tool advertised to the model, in JSON-schema form. */
export type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type CompletionConfig = {
  temperature?: number;
  maxTokens?: number;
  effortLevel?: EffortLevel;
  /** Abort signal — cancels the in-flight HTTP request when set. */
  signal?: AbortSignal;
};

export type CompletionResult = {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string;
  /** Real token counts when the provider reports them (else estimates are used). */
  usage?: Usage;
  /** Extended thinking / reasoning text, when the provider returns it. */
  thinking?: string;
};

/** Real token counts from the provider's response, when it reports them. */
export type Usage = { inputTokens: number; outputTokens: number };

/**
 * A streaming chunk. `text` deltas arrive as the model generates. A `tool_call`
 * chunk is emitted the moment a tool-call block finishes streaming (before the
 * response completes), so the loop can start a concurrency-safe tool while the
 * model is still generating later blocks. A single `done` chunk carries the
 * assembled CompletionResult (full text + ALL tool calls) so the loop can
 * proceed exactly as the non-streaming path does — `tool_call` chunks are an
 * early-start optimization, never the source of truth.
 */
export type StreamChunk =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
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
  /**
   * Optional pre-flight token counter. Returns the exact input token count the
   * provider would bill for this request, without generating a response. Used by
   * context-pipeline to proactively compact before a call that would overflow.
   * Providers that don't implement this return undefined; callers fall back to
   * char-based estimation.
   */
  countTokens?(messages: Message[], tools: ToolSchema[]): Promise<number>;
}
