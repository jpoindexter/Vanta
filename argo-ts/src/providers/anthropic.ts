import type {
  CompletionConfig,
  CompletionResult,
  LLMProvider,
  ToolSchema,
} from "./interface.js";
import type { Message, ToolCall } from "../types.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 4096;

/** Anthropic Messages API provider. SDK is lazy-imported in complete(). */
export class AnthropicProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  modelId(): string {
    return this.model;
  }

  contextWindow(): number {
    return CONTEXT_WINDOW;
  }

  async complete(
    messages: Message[],
    tools: ToolSchema[],
    config?: CompletionConfig,
  ): Promise<CompletionResult> {
    // Lazy so Argo loads even when the SDK isn't installed.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: this.apiKey });
    const { system, messages: amsgs } = toAnthropicMessages(messages);

    let response;
    try {
      response = await client.messages.create({
        model: this.model,
        max_tokens: config?.maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        messages: amsgs as Parameters<typeof client.messages.create>[0]["messages"],
        tools: tools.length
          ? (tools.map(toAnthropicTool) as Parameters<
              typeof client.messages.create
            >[0]["tools"])
          : undefined,
      });
    } catch (err) {
      throw translateError(err, this.model);
    }

    return parseResponse(response.content, response.stop_reason ?? "end_turn");
  }
}

/**
 * Convert Argo messages to Anthropic's shape. System messages are concatenated
 * into a single `system` string; the rest become role-tagged message objects.
 * Pure — no SDK import — so the conversion can be unit-tested.
 */
export function toAnthropicMessages(messages: Message[]): {
  system: string;
  messages: unknown[];
} {
  const systemParts: string[] = [];
  const out: unknown[] = [];

  for (const m of messages) {
    switch (m.role) {
      case "system":
        systemParts.push(m.content);
        break;
      case "user":
        out.push({ role: "user", content: m.content });
        break;
      case "tool":
        out.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.toolCallId,
              content: m.content,
            },
          ],
        });
        break;
      case "assistant":
        out.push(toAssistantMessage(m.content, m.toolCalls));
        break;
    }
  }

  return { system: systemParts.join("\n\n"), messages: out };
}

function toAssistantMessage(content: string, toolCalls?: ToolCall[]): unknown {
  if (!toolCalls?.length) {
    return { role: "assistant", content };
  }
  const blocks: unknown[] = [];
  // Anthropic rejects empty text blocks — only include text when present.
  if (content) blocks.push({ type: "text", text: content });
  for (const tc of toolCalls) {
    blocks.push({
      type: "tool_use",
      id: tc.id,
      name: tc.name,
      input: tc.arguments,
    });
  }
  return { role: "assistant", content: blocks };
}

function toAnthropicTool(t: ToolSchema): {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
} {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  };
}

/** Narrow Anthropic response content blocks into a CompletionResult. */
function parseResponse(content: unknown, finishReason: string): CompletionResult {
  const blocks = Array.isArray(content) ? content : [];
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      const id = typeof block.id === "string" ? block.id : "";
      const name = typeof block.name === "string" ? block.name : "";
      const args = isRecord(block.input) ? block.input : {};
      toolCalls.push({ id, name, arguments: args });
    }
  }

  return { text: textParts.join(""), toolCalls, finishReason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function translateError(err: unknown, model: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/api.?key|authentication|401/i.test(message)) {
    return new Error(
      `Anthropic auth failed for "${model}". Check ANTHROPIC_API_KEY. Original: ${message}`,
    );
  }
  return new Error(`LLM request failed (${model}): ${message}`);
}
