import { join } from "node:path";
import { applyCompression,compressEnabled,shouldCompressTool } from "../compress/apply.js";
import { densifySearchResult,shouldDensifyTool } from "../compress/search-densify.js";
import { executeToolEffect } from "../effects/tool-effect-gateway.js";
import { buildSelfMonitorText,shouldWarn } from "../repl/self-monitor.js";
import { resolveToolRetries,shouldRetryTool } from "../tool-retry.js";
import type { ToolContext,ToolResult } from "../tools/types.js";
import type { ToolCall } from "../types.js";
import type { AgentDeps } from "./agent-types.js";
import { compressReadFile,toonView } from "./toon-output.js";

export type { SafetyGateResult } from "./dispatch-safety-types.js";
export { applySafetyGate } from "./dispatch-safety.js";

/**
 * Execute tool with self-monitor heuristic and transient-failure retry loop.
 * Returns the final result (honest, never faked success).
 */
export async function executeWithRetry(
  call: ToolCall,
  deps: AgentDeps,
  ctx: ToolContext,
  tool: any, // The tool object from registry.get()
): Promise<ToolResult> {
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
  let res = await executeToolEffect(call.name, call.arguments, tool, ctx);
  const budget = resolveToolRetries();
  for (let attempt = 1; attempt <= budget && shouldRetryTool(call.name, res.ok, res.output); attempt++) {
    deps.onText?.(`  ↻ ${call.name} hit a transient failure — retry ${attempt}/${budget}`);
    const retryCtx = ctx.effectCallId
      ? { ...ctx, effectCallId: `${ctx.effectCallId}:retry-${attempt}` }
      : ctx;
    res = await executeToolEffect(call.name, call.arguments, tool, retryCtx);
  }

  return res;
}

/**
 * Compress tool output if enabled. Native context compression: shrink a fat tool output
 * ONCE here, before it enters history. read_file gets AST/TOON handling; object-array JSON
 * from any tool gets a lossless TOON table (safe — every row kept); other voluminous
 * media/web outputs go through the lossy allow-listed crushers. Reversible via CCR.
 * Best-effort. Returns { output, tokensSaved } for tracking.
 */
export async function compressOutput(
  toolName: string,
  output: string,
  dataDir: string,
): Promise<{ output: string; tokensSaved: number }> {
  if (!compressEnabled()) return { output, tokensSaved: 0 };
  const vantaDir = join(dataDir, ".vanta");
  if (toolName === "read_file") return compressReadFile(output, vantaDir);
  // SEARCH-RESULT-DENSIFY: a SEPARATE lossless lane for grep/search output.
  // It runs here (so it lands BEFORE result-offload in dispatch-tool.ts) and is
  // deliberately NOT part of the lossy COMPRESS_TOOLS allow-list — densifying
  // preserves every line:content byte (round-trip-guarded), so unlike the lossy
  // crushers it is safe on a precision search result and can drop it back under
  // the 50K offload threshold instead of truncating it.
  if (shouldDensifyTool(toolName)) {
    const dense = densifySearchResult(output);
    return { output: dense.output, tokensSaved: dense.tokensSaved };
  }
  const view = toonView(output);
  if (view) return view;
  if (!shouldCompressTool(toolName)) return { output, tokensSaved: 0 };
  const applied = await applyCompression(output, vantaDir);
  return { output: applied.output, tokensSaved: applied.tokensSaved || 0 };
}
