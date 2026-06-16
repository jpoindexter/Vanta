import type { ToolSchema, CompletionResult } from "./interface.js";
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
