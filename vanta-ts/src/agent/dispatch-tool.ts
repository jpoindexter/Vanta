import type { ToolCall } from "../types.js";
import type { ToolContext } from "../tools/types.js";
import type { AgentDeps } from "./agent-types.js";
import { applySafetyGate, executeWithRetry, compressOutput } from "./dispatch-helpers.js";
import { offloadResult } from "../compress/result-offload.js";
import { isPlanBlocked } from "./plan-gate.js";
import { join } from "node:path";

export type DispatchOutcome = { executed: boolean; empty: boolean; output: string; ok: boolean; tokensSaved?: number };

export async function dispatchTool(
  call: ToolCall,
  deps: AgentDeps,
  ctx: ToolContext,
): Promise<DispatchOutcome> {
  deps.onToolCall?.(call.name, call.arguments);
  deps.onEvent?.({ type: "tool_start", name: call.name, args: call.arguments });

  const tool = deps.registry.get(call.name);

  // Plan mode: enforce read-only restriction when plan mode is active.
  if (isPlanBlocked(call.name, deps.planGate)) {
    const output = `blocked: plan mode is active — read-only tools only. Present your plan and run /planmode approve to proceed.`;
    deps.onToolResult?.(call.name, false, output);
    deps.onEvent?.({ type: "tool_end", name: call.name, ok: false, output });
    return { executed: false, empty: false, ok: false, output };
  }

  const gateResult = await applySafetyGate(call, deps, ctx);
  if (!gateResult.approved) {
    return { executed: false, empty: false, ok: false, output: gateResult.reason ?? "approval denied" };
  }

  const res = await executeWithRetry(call, deps, ctx, tool);
  deps.onToolResult?.(call.name, res.ok, res.output, res.diff);
  deps.onEvent?.({ type: "tool_end", name: call.name, ok: res.ok, output: res.output });

  const compressed = await compressOutput(call.name, res.output, ctx.root);
  // Tool-result offload: size-based backstop AFTER lossy compression — catches any
  // tool (incl. non-allow-listed reads/shell) whose output is still oversized,
  // stashing it whole (CCR store) and replacing it with a preview + retrieval id.
  const offloaded = await offloadResult(compressed.output, { toolName: call.name, dataDir: join(ctx.root, ".vanta") });
  return { executed: true, empty: offloaded.output.trim().length === 0, ok: res.ok, output: offloaded.output, tokensSaved: compressed.tokensSaved };
}
