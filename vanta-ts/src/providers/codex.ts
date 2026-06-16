import { randomUUID } from "node:crypto";
import type { CompletionConfig, CompletionResult, LLMProvider, StreamChunk, ToolSchema } from "./interface.js";
import type { Message } from "../types.js";
import { CODEX_BASE_URL, defaultCodexAuthPath, loadCodexCreds, readCodexAuth, type CodexCreds } from "./codex-auth.js";
import { drainCodexSSE, toCodexInput, toCodexTools } from "./codex-codec.js";
export { toCodexInput, toCodexTools, sanitizeCodexParams } from "./codex-codec.js";

// Provider for the OpenAI Codex (ChatGPT subscription) backend. Unlike OpenAI's
// public Functions API, this endpoint speaks the *Responses* API over SSE, so it
// gets its own provider rather than a baseURL swap on OpenAIProvider. Auth is the
// shared ~/.codex/auth.json OAuth session (see codex-auth.ts).

const CODEX_CONTEXT: Record<string, number> = {
  "gpt-5.5": 272_000,
  "gpt-5.4": 272_000,
  "gpt-5.4-mini": 272_000,
  "codex-auto-review": 272_000,
  "gpt-5.3-codex-spark": 128_000,
};

export type CodexProviderOpts = {
  model: string;
  authPath?: string;
  fetchImpl?: typeof fetch;
  /** Override credential resolution (tests). Defaults to loadCodexCreds. */
  loadCreds?: () => Promise<CodexCreds>;
};

export class CodexProvider implements LLMProvider {
  private readonly model: string;
  private readonly ctxWindow: number;
  private readonly fetchImpl: typeof fetch;
  private readonly resolveCreds: () => Promise<CodexCreds>;
  private readonly sessionId = randomUUID();

  constructor(opts: CodexProviderOpts) {
    this.model = opts.model;
    this.ctxWindow = CODEX_CONTEXT[opts.model] ?? 272_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (opts.loadCreds) {
      this.resolveCreds = opts.loadCreds;
    } else {
      const authPath = opts.authPath ?? defaultCodexAuthPath();
      readCodexAuth(authPath); // fail fast with an actionable error if not logged in
      this.resolveCreds = () => loadCodexCreds({ authPath, fetchImpl: this.fetchImpl });
    }
  }

  modelId(): string {
    return this.model;
  }

  contextWindow(): number {
    return this.ctxWindow;
  }

  async complete(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): Promise<CompletionResult> {
    let result: CompletionResult = { text: "", toolCalls: [], finishReason: "stop" };
    for await (const chunk of this.stream(messages, tools, config)) {
      if (chunk.type === "done") result = chunk.result;
    }
    return result;
  }

  async *stream(messages: Message[], tools: ToolSchema[], config?: CompletionConfig): AsyncIterable<StreamChunk> {
    const creds = await this.resolveCreds();
    const body = buildCodexBody(this.model, messages, tools, config);
    const res = await fetchCodexStream({ fetchImpl: this.fetchImpl, creds, sessionId: this.sessionId, body, config });
    yield* drainCodexSSE(res.body!);
  }

}

function buildCodexBody(model: string, messages: Message[], tools: ToolSchema[], config?: CompletionConfig): Record<string, unknown> {
  const { instructions, input } = toCodexInput(messages);
  return {
    model,
    instructions,
    input,
    tools: tools.length ? toCodexTools(tools) : undefined,
    tool_choice: tools.length ? "auto" : undefined,
    stream: true,
    store: false,
    ...(config?.maxTokens ? { max_output_tokens: config.maxTokens } : {}),
  };
}

type FetchCodexOpts = {
  fetchImpl: typeof fetch;
  creds: CodexCreds;
  sessionId: string;
  body: Record<string, unknown>;
  config?: CompletionConfig;
};

async function fetchCodexStream(opts: FetchCodexOpts): Promise<Response> {
  const res = await opts.fetchImpl(`${CODEX_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.creds.accessToken}`,
      "chatgpt-account-id": opts.creds.accountId,
      "OpenAI-Beta": "responses=experimental",
      originator: "codex_cli_rs",
      session_id: opts.sessionId,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(opts.body),
    signal: opts.config?.signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Codex request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res;
}

