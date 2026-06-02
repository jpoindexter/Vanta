import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type {
  CompletionConfig,
  CompletionResult,
  LLMProvider,
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
      response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages.map(toOpenAIMessage),
        tools: tools.length ? tools.map(toOpenAITool) : undefined,
        temperature: config?.temperature ?? 0.2,
        max_tokens: config?.maxTokens,
      });
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
    };
  }
}

function toOpenAIMessage(m: Message): ChatCompletionMessageParam {
  switch (m.role) {
    case "system":
      return { role: "system", content: m.content };
    case "user":
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
