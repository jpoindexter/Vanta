import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type {
  CompletionConfig,
  CompletionResult,
  LLMProvider,
  StreamChunk,
  ToolSchema,
} from "./interface.js";
import type { Message, ToolCall } from "../types.js";

const CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4.1": 1_000_000,
  "gpt-4.1-mini": 1_000_000,
  "o3-mini": 200_000,
  "qwen2.5:14b": 32_000,
  "llama3.2": 128_000,
  // Gemini (OpenAI-compat endpoint)
  "gemini-2.5-pro": 1_000_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
};

/** Covers OpenAI and any OpenAI-compatible endpoint (Ollama, LM Studio). */
export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly ctxWindow: number;

  constructor(opts: { apiKey: string; baseURL?: string; model: string }) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    this.model = opts.model;
    this.ctxWindow = CONTEXT_WINDOWS[opts.model] ?? 32_000;
  }

  modelId(): string {
    return this.model;
  }

  contextWindow(): number {
    return this.ctxWindow;
  }

  async complete(
    messages: Message[],
    tools: ToolSchema[],
    config?: CompletionConfig,
  ): Promise<CompletionResult> {
    let response;
    try {
      response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(toOpenAIMessage),
          tools: tools.length ? tools.map(toOpenAITool) : undefined,
          temperature: config?.temperature ?? 0.2,
          max_tokens: config?.maxTokens,
        },
        { signal: config?.signal },
      );
    } catch (err) {
      throw translateError(err, this.model);
    }

    const choice = response.choices[0];
    if (!choice) {
      return { text: "", toolCalls: [], finishReason: "empty" };
    }
    const toolCalls: ToolCall[] = [];
    for (const tc of choice.message.tool_calls ?? []) {
      if (tc.type !== "function") continue;
      toolCalls.push(parseToolCall(tc));
    }
    return {
      text: choice.message.content ?? "",
      toolCalls,
      finishReason: choice.finish_reason ?? "stop",
      usage: response.usage
        ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
        : undefined,
    };
  }

  async *stream(
    messages: Message[],
    tools: ToolSchema[],
    config?: CompletionConfig,
  ): AsyncIterable<StreamChunk> {
    let stream;
    try {
      stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map(toOpenAIMessage),
          tools: tools.length ? tools.map(toOpenAITool) : undefined,
          temperature: config?.temperature ?? 0.2,
          max_tokens: config?.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: config?.signal },
      );
    } catch (err) {
      throw translateError(err, this.model);
    }

    let text = "";
    let finishReason = "stop";
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    const toolDeltas: ToolCallDelta[] = [];
    for await (const chunk of stream) {
      // The final usage chunk (with include_usage) has empty choices + a usage field.
      if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) {
        text += delta.content;
        yield { type: "text", delta: delta.content };
      }
      for (const tc of delta?.tool_calls ?? []) {
        toolDeltas.push({ index: tc.index, id: tc.id, function: tc.function });
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    yield {
      type: "done",
      result: { text, toolCalls: foldToolCallDeltas(toolDeltas), finishReason, usage },
    };
  }
}

export type ToolCallDelta = {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

/**
 * Assemble streamed tool-call fragments into complete ToolCalls. OpenAI streams
 * each tool call across many deltas keyed by `index`: the id + name arrive once,
 * the JSON arguments arrive in pieces to concatenate. Pure. Drops any call that
 * never got a name (malformed stream).
 */
export function foldToolCallDeltas(deltas: ToolCallDelta[]): ToolCall[] {
  const byIndex = new Map<number, { id: string; name: string; args: string }>();
  for (const d of deltas) {
    const cur = byIndex.get(d.index) ?? { id: "", name: "", args: "" };
    if (d.id) cur.id = d.id;
    if (d.function?.name) cur.name = d.function.name;
    if (d.function?.arguments) cur.args += d.function.arguments;
    byIndex.set(d.index, cur);
  }
  return [...byIndex.values()]
    .filter((c) => c.name)
    .map((c) => ({ id: c.id, name: c.name, arguments: parseArgs(c.args) }));
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
}

function toOpenAIMessage(m: Message): ChatCompletionMessageParam {
  switch (m.role) {
    case "system":
      return { role: "system", content: m.content };
    case "user":
      if (m.images?.length) {
        return {
          role: "user",
          content: [
            ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
            ...m.images.map((img) => ({
              type: "image_url" as const,
              image_url: { url: `data:${img.mime};base64,${img.dataBase64}` },
            })),
          ],
        };
      }
      return { role: "user", content: m.content };
    case "tool":
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    case "assistant":
      return {
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }
          : {}),
      };
  }
}

function toOpenAITool(t: ToolSchema): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  };
}

function parseToolCall(tc: {
  id: string;
  function: { name: string; arguments: string };
}): ToolCall {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    args = { _raw: tc.function.arguments };
  }
  return { id: tc.id, name: tc.function.name, arguments: args };
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
