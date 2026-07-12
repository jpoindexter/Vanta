import type { EffectDisposition, Message, ToolCall } from "../types.js";
import { isConcurrencySafe } from "./stream-dispatch.js";
import { isRetryableTool } from "../tool-retry.js";

/** Unknown/plugin/MCP tools fail toward effect-capable; only known reads are effect-free. */
export function toolMayHaveSideEffects(name: string): boolean {
  return !isConcurrencySafe(name) && !isRetryableTool(name);
}

export function interruptedDisposition(call: ToolCall, executionStarted: boolean): EffectDisposition {
  if (!executionStarted || !toolMayHaveSideEffects(call.name)) return "none";
  return "unknown";
}

export function interruptedToolResult(call: ToolCall, disposition: EffectDisposition): Extract<Message, { role: "tool" }> {
  const content = disposition === "unknown"
    ? "[tool execution was interrupted; side effects are UNKNOWN. Inspect current state before any retry. Do not repeat this mutation blindly.]"
    : "[tool did not produce a result; no side effect is expected. It may be retried only if still needed.]";
  return { role: "tool", toolCallId: call.id, name: call.name, content, effectDisposition: disposition };
}

export function reconcileDanglingToolResults(messages: Message[]): { messages: Message[]; added: number } {
  const resultIds = new Set(messages.filter((m): m is Extract<Message, { role: "tool" }> => m.role === "tool").map((m) => m.toolCallId));
  const out: Message[] = [];
  let added = 0;
  for (const message of messages) {
    out.push(message);
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      if (resultIds.has(call.id)) continue;
      // Explicit pending proves execution had not started. Legacy calls have no
      // marker, so mutators recover conservatively as unknown.
      const started = call.effectState !== "pending";
      out.push(interruptedToolResult(call, interruptedDisposition(call, started)));
      resultIds.add(call.id);
      added++;
    }
  }
  return { messages: out, added };
}
