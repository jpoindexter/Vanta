import OpenAI from "openai";
import type { CompletionConfig, CompletionResult, LLMProvider, StreamChunk, ToolSchema } from "./interface.js";
import type { Message } from "../types.js";
import { buildOpenAIEffortParams, debugEffort } from "./effort.js";
import { resolveProviderTimeoutMs } from "./timeout.js";
import {
  foldToolCallDeltas,
  completedToolCalls,
  reasoningDelta,
  mapCompletionResponse,
  toOpenAIMessage,
  toOpenAITool,
  type ToolCallDelta,
} from "./openai-convert.js";

const CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4.1": 1_000_000,
  "gpt-4.1-mini": 1_000_000,
  "o3-mini": 200_000,
  "qwen2.5:14b": 32_000,
  "llama3.2": 128_000,
  "gemini-2.5-pro": 1_000_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
  "MiniMax-M3": 1_048_576, // 1M (minimax.io/models/text/m3)
  "MiniMax-M2": 204_800,
};

const DEFAULT_CONTEXT_WINDOW = 32_000;

/**
 * Resolve a model's context window. `VANTA_CONTEXT_WINDOW` overrides everything so
 * an UNMAPPED model (a new release Vanta doesn't know yet) isn't silently capped at
 * the conservative 32k default — which makes the context gauge read wrong and Vanta
 * over-compact. Falls back to the table, then the default.
 */
export function resolveContextWindow(model: string, env: NodeJS.ProcessEnv = process.env): number {
  const override = Number(env.VANTA_CONTEXT_WINDOW);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  // Routers (TokenRouter "minimax:MiniMax-M3", OpenRouter "minimax/minimax-m3")
  // prefix the id with a provider segment — strip it, and match case-insensitively.
  const want = model.toLowerCase();
  const bare = model.replace(/^[^:/]+[:/]/, "").toLowerCase();
  for (const [k, v] of Object.entries(CONTEXT_WINDOWS)) {
    const key = k.toLowerCase();
    if (key === want || key === bare) return v;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly ctxWindow: number;

  constructor(opts: {
    apiKey: string; baseURL?: string; model: string;
    defaultQuery?: Record<string, string>; defaultHeaders?: Record<string, string>;
    timeoutMs?: number;
  }) {
    this.client = new OpenAI({
      apiKey: opts.apiKey, baseURL: opts.baseURL,
      defaultQuery: opts.defaultQuery, defaultHeaders: opts.defaultHeaders,
      // PROVIDER-AWARE-WATCHDOG: an explicit, cold-start-aware request timeout
      // (defaults to the active provider's configured value) instead of the SDK's
      // hidden default, so the liveness watchdog can derive its window from it.
      timeout: opts.timeoutMs ?? resolveProviderTimeoutMs(process.env),
    });
    this.model = opts.model;
    this.ctxWindow = resolveContextWindow(opts.model);
  }

  modelId(): string { return this.model; }
  contextWindow(): number { return this.ctxWindow; }

  async complete(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): Promise<CompletionResult> {
    let response;
    try {
      response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(toOpenAIMessage),
          tools: tools.length ? tools.map(toOpenAITool) : undefined,
          temperature: config?.temperature ?? 0.2,
          max_tokens: config?.maxTokens,
          ...buildOpenAIEffortParams(this.model, config, debugEffort),
        },
        { signal: config?.signal },
      );
    } catch (err) {
      throw translateError(err, this.model);
    }
    return mapCompletionResponse(response);
  }

  async *stream(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): AsyncIterable<StreamChunk> {
    const stream = await this.openStream(messages, tools, config);
    let text = "";
    let finishReason = "stop";
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    const toolDeltas: ToolCallDelta[] = [];
    let emittedThrough = -1;
    for await (const chunk of stream) {
      if (chunk.usage) usage = {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
        ...(chunk.usage.prompt_tokens_details?.cached_tokens != null ? { cacheTokens: chunk.usage.prompt_tokens_details.cached_tokens } : {}),
        ...(chunk.usage.completion_tokens_details?.reasoning_tokens != null ? { reasoningTokens: chunk.usage.completion_tokens_details.reasoning_tokens } : {}),
      };
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) { text += delta.content; yield { type: "text", delta: delta.content }; }
      const think = reasoningDelta(delta);
      if (think) yield { type: "thinking", delta: think };
      if (delta?.tool_calls?.length) {
        for (const tc of delta.tool_calls) toolDeltas.push({ index: tc.index, id: tc.id, function: tc.function });
        const newly = completedToolCalls(toolDeltas, emittedThrough);
        emittedThrough = newly.emittedThrough;
        for (const call of newly.calls) yield { type: "tool_call", call };
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    yield { type: "done", result: { text, toolCalls: foldToolCallDeltas(toolDeltas), finishReason, usage } };
  }

  private async openStream(messages: Message[], tools: ToolSchema[], config?: CompletionConfig) {
    try {
      return await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(toOpenAIMessage),
          tools: tools.length ? tools.map(toOpenAITool) : undefined,
          temperature: config?.temperature ?? 0.2,
          max_tokens: config?.maxTokens,
          ...buildOpenAIEffortParams(this.model, config, debugEffort),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: config?.signal },
      );
    } catch (err) {
      throw translateError(err, this.model);
    }
  }
}

function translateError(err: unknown, model: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/tool|function.?call/i.test(message)) {
    return new Error(
      `Model "${model}" may not support tool/function calling. ` +
        `Try a tool-capable model (gpt-4o-mini, qwen2.5, llama3.2). Original: ${message}`,
    );
  }
  return new Error(`LLM request failed (${model}): ${message}`);
}

export { foldToolCallDeltas, completedToolCalls, type ToolCallDelta } from "./openai-convert.js";
