import { randomUUID } from "node:crypto";
import type { CompletionConfig, CompletionResult, LLMProvider, StreamChunk, ToolSchema } from "./interface.js";
import type { Message, ToolCall } from "../types.js";
import { CODEX_BASE_URL, defaultCodexAuthPath, loadCodexCreds, readCodexAuth, type CodexCreds } from "./codex-auth.js";

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

// Strict-backend keys the Codex endpoint rejects at the TOP level of a tool's
// parameter schema (it requires type:"object"). Nested combinators are fine.
const FORBIDDEN_TOP_LEVEL = ["allOf", "anyOf", "oneOf", "enum", "not"] as const;

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
    const { instructions, input } = toCodexInput(messages);
    const body = {
      model: this.model,
      instructions,
      input,
      tools: tools.length ? toCodexTools(tools) : undefined,
      tool_choice: tools.length ? "auto" : undefined,
      stream: true,
      store: false,
      ...(config?.maxTokens ? { max_output_tokens: config.maxTokens } : {}),
    };

    const res = await this.fetchImpl(`${CODEX_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "chatgpt-account-id": creds.accountId,
        "OpenAI-Beta": "responses=experimental",
        originator: "codex_cli_rs",
        session_id: this.sessionId,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Codex request failed (${res.status}) for model "${this.model}": ${detail.slice(0, 300)}`);
    }

    let text = "";
    const toolCalls: ToolCall[] = [];
    for await (const ev of parseSSE(res.body)) {
      if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
        text += ev.delta;
        yield { type: "text", delta: ev.delta };
      } else if (ev.type === "response.output_item.done" && ev.item?.type === "function_call") {
        toolCalls.push({ id: ev.item.call_id, name: ev.item.name, arguments: parseArgs(ev.item.arguments) });
      } else if (ev.type === "response.failed" || ev.type === "error") {
        throw new Error(`Codex response error: ${JSON.stringify(ev.response?.error ?? ev).slice(0, 300)}`);
      }
    }
    yield { type: "done", result: { text, toolCalls, finishReason: toolCalls.length ? "tool_calls" : "stop" } };
  }
}

/** Map Argo messages onto the Responses API `instructions` + `input` items. */
export function toCodexInput(messages: Message[]): { instructions: string; input: unknown[] } {
  const system: string[] = [];
  const input: unknown[] = [];
  for (const m of messages) {
    switch (m.role) {
      case "system":
        system.push(m.content);
        break;
      case "user":
        input.push({
          role: "user",
          content: [
            { type: "input_text", text: m.content },
            ...(m.images?.map((img) => ({
              type: "input_image",
              image_url: `data:${img.mime};base64,${img.dataBase64}`,
            })) ?? []),
          ],
        });
        break;
      case "assistant":
        if (m.content) input.push({ role: "assistant", content: [{ type: "output_text", text: m.content }] });
        for (const tc of m.toolCalls ?? []) {
          input.push({ type: "function_call", call_id: tc.id, name: tc.name, arguments: JSON.stringify(tc.arguments) });
        }
        break;
      case "tool":
        input.push({ type: "function_call_output", call_id: m.toolCallId, output: m.content });
        break;
    }
  }
  return { instructions: system.join("\n\n"), input };
}

/** Map Argo tool schemas onto Responses API (flat) function tools, sanitized. */
export function toCodexTools(tools: ToolSchema[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: sanitizeCodexParams(t.parameters),
    strict: false,
  }));
}

/** Drop top-level combinators the strict Codex backend rejects; force type:object. */
export function sanitizeCodexParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const key of FORBIDDEN_TOP_LEVEL) delete out[key];
  if (out.type !== "object") out.type = "object";
  if (typeof out.properties !== "object" || out.properties === null) out.properties = {};
  return out;
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
}

/** Parse a Responses-API SSE byte stream into decoded `data:` event objects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload);
      } catch {
        // skip malformed event
      }
    }
  }
}
