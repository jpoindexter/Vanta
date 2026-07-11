import { estimateTokens } from "../context.js";
import type { ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";
import type { Tool } from "./types.js";

type RoleSummary = { messages: number; characters: number; tokens: number };
type ContextSurface = {
  source: "system_messages" | "user_messages" | "assistant_messages" | "tool_results" | "tool_schemas";
  tokens: number;
  percentOfEstimate: number;
};

export type ContextInspection = {
  messageCount: number;
  toolCount: number;
  messageTokens: number;
  toolSchemaTokens: number;
  estimatedTokens: number;
  contextWindow: number;
  utilizationPct: number;
  byRole: Partial<Record<Message["role"], RoleSummary>>;
  rankedSurfaces: ContextSurface[];
  /** The first three non-zero distinct entries from rankedSurfaces. */
  topThreeMeasuredSurfaces: ContextSurface[];
  largestMessages: Array<{ index: number; role: Message["role"]; characters: number; tokens: number }>;
};

export function buildContextInspection(messages: Message[], tools: ToolSchema[], contextWindow: number): ContextInspection {
  const byRole: ContextInspection["byRole"] = {};
  for (const role of ["system", "user", "assistant", "tool"] as const) {
    const selected = messages.filter((message) => message.role === role);
    if (!selected.length) continue;
    byRole[role] = {
      messages: selected.length,
      characters: selected.reduce((sum, message) => sum + message.content.length, 0),
      tokens: estimateTokens(selected),
    };
  }
  const messageTokens = estimateTokens(messages);
  const toolSchemaTokens = Math.ceil(JSON.stringify(tools).length / 4);
  const estimatedTokens = messageTokens + toolSchemaTokens;
  const safeWindow = Math.max(0, contextWindow);
  const surfaceTokens: Array<[ContextSurface["source"], number]> = [
    ["system_messages", byRole.system?.tokens ?? 0],
    ["user_messages", byRole.user?.tokens ?? 0],
    ["assistant_messages", byRole.assistant?.tokens ?? 0],
    ["tool_results", byRole.tool?.tokens ?? 0],
    ["tool_schemas", toolSchemaTokens],
  ];
  const rankedSurfaces = surfaceTokens
    .map(([source, tokens]) => ({
      source,
      tokens,
      percentOfEstimate: estimatedTokens > 0 ? Math.round((tokens / estimatedTokens) * 10_000) / 100 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens || a.source.localeCompare(b.source));
  return {
    messageCount: messages.length,
    toolCount: tools.length,
    messageTokens,
    toolSchemaTokens,
    estimatedTokens,
    contextWindow: safeWindow,
    utilizationPct: safeWindow > 0 ? Math.round((estimatedTokens / safeWindow) * 10_000) / 100 : 0,
    byRole,
    rankedSurfaces,
    topThreeMeasuredSurfaces: rankedSurfaces.filter((surface) => surface.tokens > 0).slice(0, 3),
    largestMessages: messages
      .map((message, index) => ({ index, role: message.role, characters: message.content.length, tokens: estimateTokens([message]) }))
      .sort((a, b) => b.tokens - a.tokens || a.index - b.index)
      .slice(0, 5),
  };
}

export const inspectContextTool: Tool = {
  schema: {
    name: "inspect_context",
    description: "Measure the live conversation context without exposing message contents: token estimates by role, exposed tool-schema cost, context-window utilization, and the largest message slots. Use before ranking prompt or context costs.",
    parameters: { type: "object", properties: {} },
  },
  describeForSafety: () => "inspect live context size and composition",
  async execute(_args, ctx) {
    if (!ctx.inspectContext) return { ok: false, output: "live context inspection is not available in this host" };
    return { ok: true, output: JSON.stringify(ctx.inspectContext(), null, 2) };
  },
};
