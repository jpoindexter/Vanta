import type { ToolCall } from "../types.js";
import type { ToolContext } from "../tools/types.js";
import type { AgentDeps } from "./agent-types.js";
import { applySafetyGate, executeWithRetry, compressOutput } from "./dispatch-helpers.js";
import { offloadResult } from "../compress/result-offload.js";
import { isPlanBlocked } from "./plan-gate.js";
import { firePreToolUse, fireHooks } from "../hooks/shell-hooks.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { acceptsEditsWithoutKernel, resolvePermissionMode } from "../modes/permission-mode.js";
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

  const dataDir = join(ctx.root, ".vanta");
  const hookDeps = buildAgentHookDeps(deps);
  const preBlocked = await applyPreToolUseHooks(call, deps, ctx, hookDeps);
  if (preBlocked) return preBlocked;

  const execCtx = executionContext(call.name, ctx);
  const res = await executeWithRetry(call, deps, execCtx, tool);
  deps.onToolResult?.(call.name, res.ok, res.output, res.diff);
  deps.onEvent?.({ type: "tool_end", name: call.name, ok: res.ok, output: res.output });
  firePostToolHooks({ dataDir, root: ctx.root, call, res, hookDeps });

  const compressed = await compressOutput(call.name, res.output, ctx.root);
  // Tool-result offload: size-based backstop AFTER lossy compression — catches any
  // tool (incl. non-allow-listed reads/shell) whose output is still oversized,
  // stashing it whole (CCR store) and replacing it with a preview + retrieval id.
  const offloaded = await offloadResult(compressed.output, { toolName: call.name, dataDir, modelId: deps.provider?.modelId?.() });
  return { executed: true, empty: offloaded.output.trim().length === 0, ok: res.ok, output: offloaded.output, tokensSaved: compressed.tokensSaved };
}

/**
 * The last user-defined gate before execution. Exit-code semantics
 * (see hook-exit-codes.ts): exit 2 BLOCKS and feeds stderr to the model;
 * any other non-zero is non-blocking and surfaces stderr to the user;
 * exit 0 is silent. Returns a blocked outcome, or `undefined` to allow.
 */
async function applyPreToolUseHooks(
  call: ToolCall,
  deps: AgentDeps,
  ctx: ToolContext,
  hookDeps: ReturnType<typeof buildAgentHookDeps>,
): Promise<DispatchOutcome | undefined> {
  const dataDir = join(ctx.root, ".vanta");
  const pre = await firePreToolUse(dataDir, call.name, call.arguments, { cwd: ctx.root, ...hookDeps });
  if (pre.blocked) {
    const output = `blocked by PreToolUse hook: ${pre.reason}`;
    deps.onToolResult?.(call.name, false, output);
    deps.onEvent?.({ type: "tool_end", name: call.name, ok: false, output });
    return { executed: false, empty: false, ok: false, output };
  }
  if (pre.userMessage) deps.onText?.(`PreToolUse hook: ${pre.userMessage}`);
  return undefined;
}

function firePostToolHooks(o: {
  dataDir: string;
  root: string;
  call: ToolCall;
  res: { ok: boolean; output: string };
  hookDeps: ReturnType<typeof buildAgentHookDeps>;
}): void {
  const { dataDir, root, call, res, hookDeps } = o;
  const hookContext = { tool: call.name, args: call.arguments, result: { ok: res.ok, output: res.output } };
  const opts = { toolName: call.name, matcherValue: call.name, isError: !res.ok, cwd: root, ...hookDeps };
  void fireHooks(dataDir, "PostToolUse", hookContext, opts);
  if (!res.ok) void fireHooks(dataDir, "PostToolUseFailure", hookContext, { ...opts, isError: true });
}

function executionContext(toolName: string, ctx: ToolContext): ToolContext {
  if (!acceptsEditsWithoutKernel(resolvePermissionMode(process.env), toolName)) return ctx;
  return { ...ctx, requestApproval: async () => true };
}
