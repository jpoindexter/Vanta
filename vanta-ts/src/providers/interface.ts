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
  /** Actual provider route that served this call, including fallback selection. */
  servedRoute?: ProviderRoute;
};

/** Real token counts from the provider's response, when it reports them. */
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number;
  reasoningTokens?: number;
};

export type BillingMode = "metered" | "included" | "local" | "unknown";

export type ProviderRoute = {
  provider: string;
  model: string;
  /** Normalized endpoint identity; query strings and credentials are excluded. */
  baseRoute: string;
  billingMode: BillingMode;
  /** Position in a fallback chain; zero is the selected primary route. */
  fallbackDepth?: number;
};

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
  | { type: "thinking"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "done"; result: CompletionResult };

/**
 * An LLM backend. `complete()` is the non-streaming path; the optional `stream()` yields incremental
 * StreamChunks (text · thinking for reasoning models · tool_call · done). The loop streams when
 * `stream` AND an onTextDelta callback are present, else it calls `complete()`. `done` carries the
 * full assembled result on both paths, so the loop behaves identically either way.
 */
export interface LLMProvider {
  complete(
    messages: Message[],
    tools: ToolSchema[],
    config?: CompletionConfig,
  ): Promise<CompletionResult>;
  modelId(): string;
  contextWindow(): number;
  /** Stable, secret-free route metadata for usage attribution. */
  routeInfo?(): ProviderRoute;
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
