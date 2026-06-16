import type { CompletionResult, StreamChunk, ToolSchema } from "./interface.js";
import type { Message, ToolCall } from "../types.js";

// SSE codec + message/tool conversion for the Codex (Responses API) provider.
// Extracted from codex.ts (size gate). CodexProvider and HTTP helpers stay in codex.ts.

// Strict-backend keys the Codex endpoint rejects at the TOP level of a tool's
// parameter schema (it requires type:"object"). Nested combinators are fine.
export const FORBIDDEN_TOP_LEVEL = ["allOf", "anyOf", "oneOf", "enum", "not"] as const;

type SSEState = {
  text: string;
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertCodexEventOk(ev: any): void {
  if (ev.type === "response.failed" || ev.type === "error") {
    throw new Error(`Codex response error: ${JSON.stringify(ev.response?.error ?? ev).slice(0, 300)}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyCodexEvent(ev: any, state: SSEState): string | null {
  assertCodexEventOk(ev);
  if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
    state.text += ev.delta;
    return ev.delta;
  }
  if (ev.type === "response.output_item.done" && ev.item?.type === "function_call") {
    state.toolCalls.push({ id: ev.item.call_id, name: ev.item.name, arguments: parseArgs(ev.item.arguments) });
  } else if (ev.type === "response.completed" && ev.response?.usage) {
    const u = ev.response.usage;
    state.usage = { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
  }
  return null;
}

export async function* drainCodexSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamChunk> {
  const state: SSEState = { text: "", toolCalls: [] };
  for await (const ev of parseSSE(body)) {
    const delta = applyCodexEvent(ev, state);
    if (delta !== null) yield { type: "text", delta };
  }
  const { text, toolCalls, usage } = state;
  const result: CompletionResult = { text, toolCalls, finishReason: toolCalls.length ? "tool_calls" : "stop", usage };
  yield { type: "done", result };
}

/** Map Vanta messages onto the Responses API `instructions` + `input` items. */
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

/** Map Vanta tool schemas onto Responses API (flat) function tools, sanitized. */
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
