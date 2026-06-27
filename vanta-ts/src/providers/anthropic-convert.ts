import type { ToolSchema, CompletionResult, StreamChunk } from "./interface.js";
import type { Message, ToolCall } from "../types.js";
import { splitStableVolatile } from "../prompt.js";

export type AnthropicTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl?: "1h" };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
  if (!toolCalls?.length) return { role: "assistant", content };
  const blocks: unknown[] = [];
  if (content) blocks.push({ type: "text", text: content });
  for (const tc of toolCalls) {
    blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
  }
  return { role: "assistant", content: blocks };
}

export function toAnthropicTool(t: ToolSchema): { name: string; description: string; input_schema: Record<string, unknown> } {
  return { name: t.name, description: t.description, input_schema: t.parameters };
}

function parseToolUse(block: Record<string, unknown>): ToolCall {
  return {
    id: typeof block.id === "string" ? block.id : "",
    name: typeof block.name === "string" ? block.name : "",
    arguments: isRecord(block.input) ? block.input : {},
  };
}

type ParsedBlock = { text?: string; thinking?: string; toolCall?: ToolCall };

function parseBlock(block: unknown): ParsedBlock {
  if (!isRecord(block)) return {};
  if (block.type === "thinking" && typeof block.thinking === "string") return { thinking: block.thinking };
  if (block.type === "text" && typeof block.text === "string") return { text: block.text };
  if (block.type === "tool_use") return { toolCall: parseToolUse(block) };
  return {};
}

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

// ── Streaming: Anthropic Messages events → the universal StreamChunk contract ──────────────────
// text_delta → text, thinking_delta → thinking (extended thinking, live), tool_use blocks assembled
// from input_json_delta → tool_call + the final done result. Pure (events in, chunks out) so the
// whole mapping is unit-tested without the SDK or network; AnthropicProvider.stream() is thin glue.

type ToolBlock = { id: string; name: string; json: string };
type StreamState = {
  text: string;
  finishReason: string;
  usage?: { inputTokens: number; outputTokens: number };
  toolCalls: ToolCall[];
  tools: Map<number, ToolBlock>;
};

function safeJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return isRecord(v) ? v : {};
  } catch {
    return { _raw: raw };
  }
}

function readDelta(ev: Record<string, unknown>, st: StreamState): StreamChunk | null {
  if (!isRecord(ev.delta)) return null;
  const d = ev.delta;
  if (d.type === "text_delta" && typeof d.text === "string") { st.text += d.text; return { type: "text", delta: d.text }; }
  if (d.type === "thinking_delta" && typeof d.thinking === "string") return { type: "thinking", delta: d.thinking };
  if (d.type === "input_json_delta" && typeof d.partial_json === "string") {
    const b = st.tools.get(Number(ev.index));
    if (b) b.json += d.partial_json;
  }
  return null;
}

function finishBlock(ev: Record<string, unknown>, st: StreamState): StreamChunk | null {
  const b = st.tools.get(Number(ev.index));
  if (!b) return null;
  st.tools.delete(Number(ev.index));
  const call: ToolCall = { id: b.id, name: b.name, arguments: safeJson(b.json) };
  st.toolCalls.push(call);
  return { type: "tool_call", call };
}

function startUsage(ev: Record<string, unknown>, st: StreamState): void {
  if (!isRecord(ev.message) || !isRecord(ev.message.usage)) return;
  const u = ev.message.usage;
  st.usage = { inputTokens: Number(u.input_tokens) || 0, outputTokens: Number(u.output_tokens) || 0 };
}

function startToolBlock(ev: Record<string, unknown>, st: StreamState): void {
  if (!isRecord(ev.content_block) || ev.content_block.type !== "tool_use") return;
  st.tools.set(Number(ev.index), { id: String(ev.content_block.id ?? ""), name: String(ev.content_block.name ?? ""), json: "" });
}

function readMessageDelta(ev: Record<string, unknown>, st: StreamState): void {
  if (isRecord(ev.delta) && typeof ev.delta.stop_reason === "string") st.finishReason = ev.delta.stop_reason;
  if (isRecord(ev.usage) && ev.usage.output_tokens != null) st.usage = { inputTokens: st.usage?.inputTokens ?? 0, outputTokens: Number(ev.usage.output_tokens) || 0 };
}

function applyAnthropicEvent(ev: Record<string, unknown>, st: StreamState): StreamChunk | null {
  switch (ev.type) {
    case "content_block_delta": return readDelta(ev, st);
    case "content_block_stop": return finishBlock(ev, st);
    case "message_start": startUsage(ev, st); return null;
    case "content_block_start": startToolBlock(ev, st); return null;
    case "message_delta": readMessageDelta(ev, st); return null;
    default: return null;
  }
}

export async function* streamAnthropicEvents(events: AsyncIterable<unknown>): AsyncGenerator<StreamChunk> {
  const st: StreamState = { text: "", finishReason: "end_turn", toolCalls: [], tools: new Map() };
  for await (const raw of events) {
    if (!isRecord(raw)) continue;
    const chunk = applyAnthropicEvent(raw, st);
    if (chunk) yield chunk;
  }
  yield { type: "done", result: { text: st.text, toolCalls: st.toolCalls, finishReason: st.finishReason, usage: st.usage } };
}

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
          content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
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
