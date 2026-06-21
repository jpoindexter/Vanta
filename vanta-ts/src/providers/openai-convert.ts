import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { CompletionResult, ToolSchema } from "./interface.js";
import type { Message, ToolCall } from "../types.js";
import { repairToolArgs } from "./tool-call-repair.js";

export type ToolCallDelta = {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type IndexedCall = { index: number; call: ToolCall };

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
}

function foldIndexedCalls(deltas: ToolCallDelta[]): IndexedCall[] {
  const byIndex = new Map<number, { id: string; name: string; args: string }>();
  for (const d of deltas) {
    const cur = byIndex.get(d.index) ?? { id: "", name: "", args: "" };
    if (d.id) cur.id = d.id;
    if (d.function?.name) cur.name = d.function.name;
    if (d.function?.arguments) cur.args += d.function.arguments;
    byIndex.set(d.index, cur);
  }
  return [...byIndex.entries()]
    .filter(([, c]) => c.name)
    .sort((a, b) => a[0] - b[0])
    .map(([index, c]) => ({ index, call: { id: c.id, name: c.name, arguments: parseArgs(c.args) } }));
}

export function foldToolCallDeltas(deltas: ToolCallDelta[]): ToolCall[] {
  return foldIndexedCalls(deltas).map((x) => x.call);
}

export function completedToolCalls(
  deltas: ToolCallDelta[],
  emittedThrough: number,
): { calls: ToolCall[]; emittedThrough: number } {
  const indexed = foldIndexedCalls(deltas);
  const highestIndex = indexed.length ? indexed[indexed.length - 1]!.index : -1;
  const calls: ToolCall[] = [];
  let cursor = emittedThrough;
  for (const { index, call } of indexed) {
    if (index > cursor && index < highestIndex) {
      calls.push(call);
      cursor = index;
    }
  }
  return { calls, emittedThrough: cursor };
}

function parseToolCall(tc: { id: string; function: { name: string; arguments: string } }): ToolCall {
  // TOOL-CALL-REPAIR — repair malformed/partial argument JSON (weak/local models)
  // instead of failing zod and wasting a turn.
  const r = repairToolArgs(tc.function.arguments);
  return { id: tc.id, name: tc.function.name, arguments: r.args, repaired: r.repaired ? r.strategy : undefined };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapCompletionResponse(response: any): CompletionResult {
  const choice = response.choices[0];
  if (!choice) return { text: "", toolCalls: [], finishReason: "empty" };
  const toolCalls: ToolCall[] = (choice.message.tool_calls ?? [])
    .filter((tc: { type: string }) => tc.type === "function")
    .map((tc: { id: string; function: { name: string; arguments: string } }) => parseToolCall(tc));
  return {
    text: choice.message.content ?? "",
    toolCalls,
    finishReason: choice.finish_reason ?? "stop",
    usage: response.usage
      ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
      : undefined,
  };
}

export function toOpenAIMessage(m: Message): ChatCompletionMessageParam {
  switch (m.role) {
    case "system":
      return { role: "system", content: m.content };
    case "user":
      if (m.images?.length) {
        return {
          role: "user",
          content: [
            ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
            ...m.images.map((img) => ({
              type: "image_url" as const,
              image_url: { url: `data:${img.mime};base64,${img.dataBase64}` },
            })),
          ],
        };
      }
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
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            }
          : {}),
      };
  }
}

export function toOpenAITool(t: ToolSchema): ChatCompletionTool {
  return {
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  };
}
