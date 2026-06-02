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
}
