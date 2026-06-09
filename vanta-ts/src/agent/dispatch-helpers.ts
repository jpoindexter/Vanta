import type { SafetyClient } from "../safety-client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import type { ToolCall } from "../types.js";
import type { AgentDeps } from "../agent.js";
import { shouldWarn, buildSelfMonitorText } from "../repl/self-monitor.js";
import { shouldRetryTool, resolveToolRetries } from "../tool-retry.js";
import { applyCompression, compressEnabled, shouldCompressTool } from "../compress/apply.js";
import { join } from "node:path";

export type SafetyGateResult = { approved: boolean; reason?: string };

/**
 * Apply safety gate (assess + request approval) before tool execution.
 * Returns { approved, reason } where approved=true means proceed.
 */
export async function applySafetyGate(
  call: ToolCall,
  deps: AgentDeps,
  ctx: ToolContext,
): Promise<SafetyGateResult> {
  const tool = deps.registry.get(call.name);
  if (!tool) {
    return { approved: false, reason: `unknown tool: ${call.name}` };
  }

  const action = tool.describeForSafety ? tool.describeForSafety(call.arguments) : `${call.name} ${JSON.stringify(call.arguments)}`;
  const verdict = await deps.safety.assess(action);

  if (verdict.risk === "block") {
    deps.onToolResult?.(call.name, false, `blocked: ${verdict.reason}`);
    return { approved: false, reason: `blocked by safety: ${verdict.reason}` };
  }

  if (verdict.risk === "ask") {
    const approved = await deps.requestApproval(action, verdict.reason, call.name);
    const id = await deps.safety.proposeApproval(action);
    if (!approved) {
      if (id) await deps.safety.deny(id);
      deps.onToolResult?.(call.name, false, "denied by user");
      return { approved: false, reason: `denied by user: ${verdict.reason}` };
    }
    if (id) await deps.safety.approve(id);
  }

  return { approved: true };
}

/**
 * Execute tool with self-monitor heuristic and transient-failure retry loop.
 * Returns the final result (honest, never faked success).
 */
export async function executeWithRetry(
  call: ToolCall,
  deps: AgentDeps,
  ctx: ToolContext,
  tool: any, // The tool object from registry.get()
): Promise<{ ok: boolean; output: string; diff?: any[] }> {
  try {
    if (shouldWarn(call.name, deps.activeGoalText)) {
      deps.onText?.(buildSelfMonitorText(call.name, deps.activeGoalText!));
    }
  } catch {
    /* best-effort — never block */
  }

  // TOOL-RETRY: re-run only idempotent reads on a transient failure; never a
  // write/shell/spawn (re-running could double a side effect). Honest report —
  // the final result is returned as-is, success is never faked.
  let res = await tool.execute(call.arguments, ctx);
  const budget = resolveToolRetries();
  for (let attempt = 1; attempt <= budget && shouldRetryTool(call.name, res.ok, res.output); attempt++) {
    deps.onText?.(`  ↻ ${call.name} hit a transient failure — retry ${attempt}/${budget}`);
    res = await tool.execute(call.arguments, ctx);
  }

  return res;
}

/**
 * Compress tool output if enabled and allowed.
 * Native context compression (the Headroom concept): shrink a fat tool output
 * ONCE here, before it enters history. Never the system prefix, never
 * re-compressed. Compression is LOSSY, so it's allow-listed to voluminous
 * media/web outputs only (shouldCompressTool) — precision reads (read_file,
 * grep, lsp, git_diff) keep byte-for-byte fidelity. Reversible via CCR.
 * Best-effort. Returns { output, tokensSaved } for tracking.
 */
export async function compressOutput(
  toolName: string,
  output: string,
  dataDir: string,
): Promise<{ output: string; tokensSaved: number }> {
  if (!compressEnabled() || !shouldCompressTool(toolName)) {
    return { output, tokensSaved: 0 };
  }
  const applied = await applyCompression(output, join(dataDir, ".vanta"));
  return { output: applied.output, tokensSaved: applied.tokensSaved || 0 };
}
