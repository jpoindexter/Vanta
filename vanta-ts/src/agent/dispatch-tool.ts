import type { EffectDisposition, ToolCall } from "../types.js";
import type { ToolContext, Tool } from "../tools/types.js";
import type { AgentDeps } from "./agent-types.js";
import { applySafetyGate, executeWithRetry, compressOutput } from "./dispatch-helpers.js";
import { offloadResult } from "../compress/result-offload.js";
import { isPlanBlocked } from "./plan-gate.js";
import { coerceToSchema } from "../providers/tool-call-repair.js";
import { firePreToolUse, firePostToolUse, fireHooks } from "../hooks/shell-hooks.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { acceptsEditsWithoutKernel, resolvePermissionMode } from "../modes/permission-mode.js";
import { join } from "node:path";
import { loadSettings } from "../settings/store.js";
import { repairToolFailure } from "../tools/tool-boundary.js";

export type DispatchOutcome = { executed: boolean; empty: boolean; output: string; ok: boolean; effectDisposition: EffectDisposition; tokensSaved?: number };

// TOOL-CALL-REPAIR: log an auto-repair + coerce args to the tool schema so
// weak/local models clear zod on the first try.
function normalizeToolCall(call: ToolCall, tool: Tool | undefined, deps: AgentDeps): void {
  if (call.repaired) {
    deps.onEvent?.({ type: "note", text: `repaired tool args for ${call.name} (${call.repaired})` });
  }
  if (tool) call.arguments = coerceToSchema(call.arguments, tool.schema?.parameters);
}

export async function dispatchTool(
  call: ToolCall,
  deps: AgentDeps,
  ctx: ToolContext,
): Promise<DispatchOutcome> {
  deps.onToolCall?.(call.name, call.arguments);
  deps.onEvent?.({ type: "tool_start", name: call.name, args: call.arguments });

  const tool = deps.registry.get(call.name);
  normalizeToolCall(call, tool, deps); // TOOL-CALL-REPAIR: log repair + coerce to schema

  // Plan mode: enforce read-only restriction when plan mode is active.
  if (isPlanBlocked(call.name, deps.planGate)) {
    const output = `blocked: plan mode is active — read-only tools only. Present your plan and run /planmode approve to proceed.`;
    deps.onToolResult?.(call.name, false, output);
    deps.onEvent?.({ type: "tool_end", name: call.name, ok: false, output });
    return { executed: false, empty: false, ok: false, output, effectDisposition: "none" };
  }

  const gateResult = await applySafetyGate(call, deps, ctx);
  if (!gateResult.approved) {
    return { executed: false, empty: false, ok: false, output: gateResult.reason ?? "approval denied", effectDisposition: "none" };
  }

  const dataDir = join(ctx.root, ".vanta");
  const hookDeps = buildAgentHookDeps(deps);
  const preBlocked = await applyPreToolUseHooks(call, deps, ctx, hookDeps);
  if (preBlocked) return preBlocked;

  // CALL-AGENT-STREAM: give the tool a progress channel wired to the `note`
  // StreamEvent, so a long external call streams output/heartbeats mid-execution.
  const execCtx: ToolContext = { ...executionContext(call.name, ctx), onProgress: (text) => deps.onEvent?.({ type: "note", text }) };
  await ctx.onToolExecutionStart?.(call);
  const res = await executeWithRetry(call, deps, execCtx, tool);
  if (!res.ok) res.output = await addRepairPath(call.name, res.output, deps, ctx.root);
  const postBlocked = await applyPostToolUseBlock({ call, deps, ctx, res, hookDeps });
  if (postBlocked) return postBlocked;
  deps.onToolResult?.(call.name, res.ok, res.output, res.diff);
  deps.onEvent?.({ type: "tool_end", name: call.name, ok: res.ok, output: res.output });
  fireFailureHook({ dataDir, root: ctx.root, call, res, hookDeps });

  const compressed = await compressOutput(call.name, res.output, ctx.root);
  // Tool-result offload: size-based backstop AFTER lossy compression — catches any
  // tool (incl. non-allow-listed reads/shell) whose output is still oversized,
  // stashing it whole (CCR store) and replacing it with a preview + retrieval id.
  const offloaded = await offloadResult(compressed.output, { toolName: call.name, dataDir, modelId: deps.provider?.modelId?.() });
  return { executed: true, empty: offloaded.output.trim().length === 0, ok: res.ok, output: offloaded.output, effectDisposition: "confirmed", tokensSaved: compressed.tokensSaved };
}

async function addRepairPath(tool: string, output: string, deps: AgentDeps, root: string): Promise<string> {
  const settings = await loadSettings(root, process.env).catch(() => ({}));
  return repairToolFailure(tool, output, {
    schemas: registrySchemas(deps, tool), settings, profileId: process.env.VANTA_PROFILE, env: process.env,
  });
}

function registrySchemas(deps: AgentDeps, tool: string) {
  const registry = deps.registry as AgentDeps["registry"] & { schemas?: AgentDeps["registry"]["schemas"] };
  if (typeof registry.schemas === "function") return registry.schemas();
  const schema = registry.get(tool)?.schema;
  return schema ? [schema] : [];
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
    return { executed: false, empty: false, ok: false, output, effectDisposition: "none" };
  }
  if (pre.userMessage) deps.onText?.(`PreToolUse hook: ${pre.userMessage}`);
  return undefined;
}

/**
 * Run PostToolUse hooks AFTER the tool executed. A block (exit 2) without
 * `continueOnBlock` hard-stops the turn (returns a blocked outcome, as today);
 * with `continueOnBlock` the rejection reason is fed BACK to the model — appended
 * to the tool result (mutated in place) — so it can adapt and the turn continues.
 * No PostToolUse hook blocks → `undefined` (byte-identical to the prior path).
 */
async function applyPostToolUseBlock(o: {
  call: ToolCall;
  deps: AgentDeps;
  ctx: ToolContext;
  res: { ok: boolean; output: string; diff?: unknown };
  hookDeps: ReturnType<typeof buildAgentHookDeps>;
}): Promise<DispatchOutcome | undefined> {
  const { call, deps, ctx, res, hookDeps } = o;
  const dataDir = join(ctx.root, ".vanta");
  const context = { tool: call.name, args: call.arguments, result: { ok: res.ok, output: res.output } };
  const opts = { toolName: call.name, matcherValue: call.name, isError: !res.ok, cwd: ctx.root, ...hookDeps };
  const post = await firePostToolUse(dataDir, context, opts);
  if (post.hardStop) {
    const output = `blocked by PostToolUse hook: ${post.feedback ?? "rejected"}`;
    deps.onToolResult?.(call.name, false, output);
    deps.onEvent?.({ type: "tool_end", name: call.name, ok: false, output });
    return { executed: true, empty: false, ok: false, output, effectDisposition: "confirmed" };
  }
  if (post.feedback) res.output = `${res.output}\n\n[PostToolUse hook] ${post.feedback}`;
  return undefined;
}

/** PostToolUse runs through firePostToolUse (it can block); PostToolUseFailure
 *  stays fire-and-forget — it only fires when the tool already errored. */
function fireFailureHook(o: {
  dataDir: string;
  root: string;
  call: ToolCall;
  res: { ok: boolean; output: string };
  hookDeps: ReturnType<typeof buildAgentHookDeps>;
}): void {
  const { dataDir, root, call, res, hookDeps } = o;
  if (res.ok) return;
  const hookContext = { tool: call.name, args: call.arguments, result: { ok: res.ok, output: res.output } };
  const opts = { toolName: call.name, matcherValue: call.name, isError: true, cwd: root, ...hookDeps };
  void fireHooks(dataDir, "PostToolUseFailure", hookContext, opts);
}

function executionContext(toolName: string, ctx: ToolContext): ToolContext {
  if (!acceptsEditsWithoutKernel(resolvePermissionMode(process.env), toolName)) return ctx;
  return { ...ctx, requestApproval: async () => true };
}
