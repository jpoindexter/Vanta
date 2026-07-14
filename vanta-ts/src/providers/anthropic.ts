import type { CompletionConfig, CompletionResult, LLMProvider, StreamChunk, ToolSchema } from "./interface.js";
import type { Message } from "../types.js";
import { buildAnthropicEffortParams, debugEffort } from "./effort.js";
import { buildAnthropicBetas } from "./interleaved-thinking.js";
import { toAnthropicMessages, toAnthropicTool, parseResponse, streamAnthropicEvents } from "./anthropic-convert.js";
import type { AnthropicTextBlock } from "./anthropic-convert.js";

const DEFAULT_MODEL = "claude-sonnet-5";
const CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 4096;

const OAUTH_BETA = "oauth-2025-04-20";
const OAUTH_USER_AGENT = "claude-cli/1.0.0 (external, vanta)";
const CLAUDE_CODE_SPOOF = "You are Claude Code, Anthropic's official CLI for Claude.";
const EXTENDED_CACHE_BETA = "extended-cache-ttl-2025-04-11";

export function promptCache1hEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = env.ENABLE_PROMPT_CACHING_1H?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export class AnthropicProvider implements LLMProvider {
  private readonly apiKey?: string;
  private readonly authToken?: string;
  private readonly model: string;

  constructor(opts: { apiKey?: string; authToken?: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.authToken = opts.authToken;
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  modelId(): string { return this.model; }
  contextWindow(): number { return CONTEXT_WINDOW; }

  async complete(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): Promise<CompletionResult> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const oauth = Boolean(this.authToken);
    const { system, amsgs } = buildConvertedMessages(messages, oauth);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams = buildCreateParams({ model: this.model, system, amsgs, tools, config }) as any;
    const thinkingActive = Boolean(createParams.thinking);
    const client = buildAnthropicClient(Anthropic, {
      oauth,
      authToken: this.authToken,
      apiKey: this.apiKey,
      thinking: { model: this.model, thinkingActive },
    });
    let response;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await (client.messages.create(createParams, { signal: config?.signal }) as Promise<any>);
    } catch (err) {
      throw translateError(err, this.model);
    }
    const result = parseResponse(response.content, response.stop_reason ?? "end_turn");
    if (response.usage) {
      result.usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        ...(response.usage.cache_read_input_tokens != null ? { cacheTokens: response.usage.cache_read_input_tokens } : {}),
      };
    }
    return result;
  }

  async *stream(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): AsyncIterable<StreamChunk> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const oauth = Boolean(this.authToken);
    const { system, amsgs } = buildConvertedMessages(messages, oauth);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams = buildCreateParams({ model: this.model, system, amsgs, tools, config }) as any;
    const thinkingActive = Boolean(createParams.thinking);
    const client = buildAnthropicClient(Anthropic, { oauth, authToken: this.authToken, apiKey: this.apiKey, thinking: { model: this.model, thinkingActive } });
    let sdkStream: AsyncIterable<unknown>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sdkStream = await (client.messages.create({ ...createParams, stream: true }, { signal: config?.signal }) as any);
    } catch (err) {
      throw translateError(err, this.model);
    }
    yield* streamAnthropicEvents(sdkStream);
  }

  async countTokens(messages: Message[], tools: ToolSchema[]): Promise<number> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const oauth = Boolean(this.authToken);
    const client = buildAnthropicClient(Anthropic, { oauth, authToken: this.authToken, apiKey: this.apiKey });
    const { system, amsgs } = buildConvertedMessages(messages, oauth);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await (client.messages.countTokens as any)({
        model: this.model,
        system,
        messages: amsgs,
        tools: tools.length ? tools.map(toAnthropicTool) : undefined,
      });
      return (r.input_tokens as number) ?? 0;
    } catch {
      return Math.round(JSON.stringify(messages).length / 4);
    }
  }
}

type ClientOpts = {
  oauth: boolean;
  authToken?: string;
  apiKey?: string;
  thinking?: { model: string; thinkingActive: boolean };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildAnthropicClient(Anthropic: any, opts: ClientOpts): any {
  const base = [opts.oauth ? OAUTH_BETA : null, promptCache1hEnabled(process.env) ? EXTENDED_CACHE_BETA : null].filter(Boolean) as string[];
  const betas = opts.thinking ? buildAnthropicBetas(base, opts.thinking) : base;
  const defaultHeaders: Record<string, string> = {};
  if (betas.length) defaultHeaders["anthropic-beta"] = betas.join(",");
  if (opts.oauth) defaultHeaders["user-agent"] = OAUTH_USER_AGENT;
  return opts.oauth
    ? new Anthropic({ authToken: opts.authToken, defaultHeaders })
    : new Anthropic({ apiKey: opts.apiKey, defaultHeaders });
}

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
  return {
    model: opts.model,
    max_tokens: maxTokens,
    system: opts.system,
    messages: opts.amsgs,
    tools: opts.tools.length ? opts.tools.map(toAnthropicTool) : undefined,
    ...(effortParams.thinking ? { thinking: effortParams.thinking } : {}),
  };
}

function translateError(err: unknown, model: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/api.?key|authentication|401/i.test(message)) {
    return new Error(`Anthropic auth failed for "${model}". Check ANTHROPIC_API_KEY. Original: ${message}`);
  }
  return new Error(`LLM request failed (${model}): ${message}`);
}

export { toAnthropicMessages, parseResponse } from "./anthropic-convert.js";
