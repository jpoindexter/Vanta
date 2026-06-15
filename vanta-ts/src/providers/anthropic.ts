import type {
  CompletionConfig,
  CompletionResult,
  LLMProvider,
  ToolSchema,
} from "./interface.js";
import type { Message, ToolCall } from "../types.js";
import { splitStableVolatile } from "../prompt.js";
import { buildAnthropicEffortParams, debugEffort } from "./effort.js";

type AnthropicTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "1h" };
};

const DEFAULT_MODEL = "claude-sonnet-4-6";
const CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 4096;

// Grey-area: a Claude Pro/Max OAuth token (from `claude` / Claude Code) used
// programmatically. The Messages API only accepts it WITH this beta header, a
// claude-code User-Agent, and a system prompt that opens with the Claude Code
// identity line — otherwise it 400s. (See DECISIONS 2026-06-02.)
const OAUTH_BETA = "oauth-2025-04-20";
const OAUTH_USER_AGENT = "claude-cli/1.0.0 (external, vanta)";
const CLAUDE_CODE_SPOOF = "You are Claude Code, Anthropic's official CLI for Claude.";

// 1-hour prompt cache: opt-in 1-hour cache TTL (default ephemeral TTL is 5 min).
// Frugality win ONLY on long sessions — a 1h cache WRITE costs 2x base input, so
// you need ~3+ cache reads inside the hour to beat the 5-min TTL. Off by default;
// turn on for marathon/agentic runs that keep hitting the same stable prefix.
const EXTENDED_CACHE_BETA = "extended-cache-ttl-2025-04-11";

/** True when the 1-hour prompt-cache TTL is opted in (via ENABLE_PROMPT_CACHING_1H). */
export function promptCache1hEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env.ENABLE_PROMPT_CACHING_1H?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

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
    const client = buildAnthropicClient(Anthropic, { oauth, authToken: this.authToken, apiKey: this.apiKey });

    const { system, amsgs } = buildConvertedMessages(messages, oauth);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams = buildCreateParams({ model: this.model, system, amsgs, tools, config }) as any;

    let response;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await (client.messages.create(createParams, { signal: config?.signal }) as Promise<any>);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAnthropicClient(Anthropic: any, opts: { oauth: boolean; authToken?: string; apiKey?: string }): any {
  const betas = [opts.oauth ? OAUTH_BETA : null, promptCache1hEnabled(process.env) ? EXTENDED_CACHE_BETA : null].filter(Boolean) as string[];
  const defaultHeaders: Record<string, string> = {};
  if (betas.length) defaultHeaders["anthropic-beta"] = betas.join(",");
  if (opts.oauth) defaultHeaders["user-agent"] = OAUTH_USER_AGENT;
  return opts.oauth
    ? new Anthropic({ authToken: opts.authToken, defaultHeaders })
    : new Anthropic({ apiKey: opts.apiKey, defaultHeaders });
}

/** Convert messages + inject OAuth identity prefix; avoids double call to toAnthropicMessages. */
function buildConvertedMessages(
  messages: Message[],
  oauth: boolean,
): { system: string | AnthropicTextBlock[]; amsgs: unknown[] } {
  const converted = toAnthropicMessages(messages, { cache1h: promptCache1hEnabled(process.env) });
  const system: string | AnthropicTextBlock[] = oauth
    ? (Array.isArray(converted.system)
      ? [{ type: "text", text: CLAUDE_CODE_SPOOF }, ...converted.system]
      : `${CLAUDE_CODE_SPOOF}\n\n${converted.system}`)
    : converted.system;
  return { system, amsgs: converted.messages };
}

type CreateParamsOpts = {
  model: string;
  system: string | AnthropicTextBlock[];
  amsgs: unknown[];
  tools: ToolSchema[];
  config?: CompletionConfig;
};

function buildCreateParams(opts: CreateParamsOpts): Record<string, unknown> {
  const effortParams = buildAnthropicEffortParams(opts.model, opts.config, process.env, debugEffort);
  const maxTokens = effortParams.max_tokens ?? opts.config?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const params: Record<string, unknown> = {
    model: opts.model,
    max_tokens: maxTokens,
    system: opts.system,
    messages: opts.amsgs,
    tools: opts.tools.length ? opts.tools.map(toAnthropicTool) : undefined,
  };
  if (effortParams.thinking) params.thinking = effortParams.thinking;
  return params;
}

/**
 * Convert Vanta messages to Anthropic's shape. System messages are concatenated
 * and split at the stable/volatile boundary; the stable prefix gets
 * cache_control so Anthropic's ephemeral cache can reuse it across turns.
 * Pure — no SDK import — so the conversion can be unit-tested.
 */
export function toAnthropicMessages(messages: Message[], opts?: { cache1h?: boolean }): {
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
  return { system: toSystemBlocks(rawSystem, opts?.cache1h ?? false), messages: out };
}

/**
 * Apply Anthropic ephemeral cache_control to the stable prefix. When the
 * prompt has a stable/volatile split (all real Vanta prompts do), returns a
 * two-block array so Anthropic caches the stable part across sessions.
 * Falls back to a plain string for prompts without a tier separator.
 */
function toSystemBlocks(system: string, cache1h: boolean): string | AnthropicTextBlock[] {
  const { stable, volatile } = splitStableVolatile(system);
  if (!volatile) return system;
  const cache_control = cache1h
    ? ({ type: "ephemeral", ttl: "1h" } as const)
    : ({ type: "ephemeral" } as const);
  return [
    { type: "text", text: stable, cache_control },
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

type ParsedBlock = { text?: string; thinking?: string; toolCall?: ToolCall };

function parseToolUse(block: Record<string, unknown>): ToolCall {
  return {
    id: typeof block.id === "string" ? block.id : "",
    name: typeof block.name === "string" ? block.name : "",
    arguments: isRecord(block.input) ? block.input : {},
  };
}

/** Classify one Anthropic content block into text / thinking / tool-call (or nothing). */
function parseBlock(block: unknown): ParsedBlock {
  if (!isRecord(block)) return {};
  if (block.type === "thinking" && typeof block.thinking === "string") return { thinking: block.thinking };
  if (block.type === "text" && typeof block.text === "string") return { text: block.text };
  if (block.type === "tool_use") return { toolCall: parseToolUse(block) };
  return {};
}

/** Narrow Anthropic response content blocks into a CompletionResult. */
export function parseResponse(content: unknown, finishReason: string): CompletionResult {
  const blocks = Array.isArray(content) ? content : [];
  const textParts: string[] = [];
  const thinkingParts: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of blocks) {
    const p = parseBlock(block);
    if (p.text !== undefined) textParts.push(p.text);
    if (p.thinking !== undefined) thinkingParts.push(p.thinking);
    if (p.toolCall) toolCalls.push(p.toolCall);
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
