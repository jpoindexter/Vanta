import type { KernelClient } from "../kernel/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import type { ToolCall, Verdict } from "../types.js";
import type { AgentDeps } from "../agent.js";
import { shouldWarn, buildSelfMonitorText } from "../repl/self-monitor.js";
import { shouldRetryTool, resolveToolRetries } from "../tool-retry.js";
import { applyCompression, applyCodeCompression, compressEnabled, shouldCompressTool } from "../compress/apply.js";
import { stashOriginal } from "../compress/store.js";
import { toonCompress, estTokens } from "winnow";
import { tighten, matchRule } from "../permissions/rules.js";
import { loadRules } from "../permissions/store.js";
import { classifyAutoModeAction, isAutoModeEnabled, resolveAutoModeConfig } from "../permissions/auto-mode.js";
import { loadSettings } from "../settings/store.js";
import { approvalPreferenceFor, loadOperatorProfile } from "../operator-profile/profile.js";
import { appendPreferenceSignal, signalFromApprovalDecision } from "../preferences/signals.js";
import { acceptsEditsWithoutKernel, resolvePermissionMode } from "../modes/permission-mode.js";
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
  if (acceptsEditsWithoutKernel(resolvePermissionMode(process.env), call.name)) {
    return { approved: true, reason: "acceptEdits" };
  }

  const action = tool.describeForSafety ? tool.describeForSafety(call.arguments) : `${call.name} ${JSON.stringify(call.arguments)}`;
  // The kernel is THE boundary: if it is unreachable, fail CLOSED — but gracefully,
  // as a blocked tool result. Throwing here aborts the turn mid-dispatch and leaves
  // a dangling assistant tool_call that 400s every later request in the session.
  let verdict: Verdict;
  try {
    verdict = await deps.safety.assess(action);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const output = `blocked: safety kernel unreachable (${msg}) — restart vanta to relaunch it`;
    deps.onToolResult?.(call.name, false, output);
    return { approved: false, reason: output };
  }

  // Permissions: the kernel verdict is the floor. User rules may TIGHTEN it
  // (escalate to ask/deny, or auto-confirm a kernel ask) but NEVER loosen it —
  // tighten() returns "block" for any kernel block regardless of the rule.
  const ruleDecision = tighten(verdict.risk, matchRule(await loadRules(process.env), call.name, action));
  const autoDecision = await applyAutoMode(ruleDecision, call.name, action, ctx);
  const decision = await applyOperatorProfile(autoDecision, verdict.risk, call.name, action);

  if (decision.decision === "block") {
    const reason = verdict.risk === "block" ? verdict.reason : decision.reason;
    deps.onToolResult?.(call.name, false, `blocked: ${reason}`);
    return { approved: false, reason: `blocked: ${reason}` };
  }

  if (decision.decision === "ask") {
    return handleApprovalRequest(call, action, verdict, deps);
  }

  return { approved: true };
}

async function applyOperatorProfile(
  current: { decision: "allow" | "ask" | "block"; reason: string },
  kernelRisk: "allow" | "ask" | "block",
  toolName: string,
  action: string,
): Promise<{ decision: "allow" | "ask" | "block"; reason: string }> {
  if (current.decision === "block") return current;
  const profile = await loadOperatorProfile(process.env).catch(() => null);
  if (!profile) return current;
  const next = approvalPreferenceFor(profile, { toolName, action, currentDecision: current.decision, kernelRisk });
  return next.decision === current.decision ? current : next;
}

async function applyAutoMode(
  decision: "allow" | "ask" | "block",
  toolName: string,
  descriptor: string,
  ctx: ToolContext,
): Promise<{ decision: "allow" | "ask" | "block"; reason: string }> {
  if (decision === "block") return { decision, reason: "denied by a permission rule" };
  const settings = await loadSettings(ctx.root ?? process.cwd(), process.env);
  if (!isAutoModeEnabled(process.env, settings)) return { decision, reason: "kernel or permission rule" };
  return classifyAutoModeAction({
    kernelRisk: decision,
    toolName,
    descriptor,
    config: resolveAutoModeConfig(settings),
  });
}

async function handleApprovalRequest(
  call: ToolCall,
  action: string,
  verdict: Verdict,
  deps: AgentDeps,
): Promise<SafetyGateResult> {
  const why = verdict.reason || "permission rule";
  const approved = await deps.requestApproval(action, why, call.name);
  await recordApprovalSignal(call.name, action, why, approved);
  // Reconcile the kernel approval queue ONLY when the kernel itself asked.
  // Queue bookkeeping is best-effort — a kernel hiccup must not abort the turn.
  const id = verdict.risk === "ask" ? await deps.safety.proposeApproval(action).catch(() => null) : null;
  if (!approved) {
    if (id) await deps.safety.deny(id).catch(() => {});
    deps.onToolResult?.(call.name, false, "denied by user");
    return { approved: false, reason: `denied by user: ${why}` };
  }
  if (id) await deps.safety.approve(id).catch(() => {});
  return { approved: true };
}

async function recordApprovalSignal(toolName: string, action: string, reason: string, approved: boolean): Promise<void> {
  await appendPreferenceSignal(signalFromApprovalDecision({ approved, action, reason, toolName })).catch(() => {});
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

/** Opt in to columnar (dictionary) TOON — bigger lossless savings on low-cardinality data,
 * at some readability cost (the model resolves dictionary indices). Default plain TOON. */
function toonDict(): boolean {
  const v = (process.env.VANTA_TOON_DICT ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** How to read the produced table (plain vs columnar). Pure. */
function toonNote(toon: string): string {
  return toon.startsWith("TOONC ")
    ? "[winnow: lossless columnar TOON — a JSON header (cols/const/dict) then one indexed record per line]"
    : "[winnow: lossless TOON table — keys in row 1, one record per line]";
}

/** Wrap object-array output as a lossless TOON table (every row kept), or null when it
 * isn't an object-array / too small to bother. Honors VANTA_TOON_DICT. */
function toonView(output: string): { output: string; tokensSaved: number } | null {
  const toon = output.length >= 400 ? toonCompress(output, { dictionary: toonDict() }) : null;
  if (!toon) return null;
  const out = `${toon}\n${toonNote(toon)}`;
  return { output: out, tokensSaved: Math.max(0, estTokens(output) - estTokens(out)) };
}

/** read_file compression: AST skeleton for TS/JS; a lossless TOON view for large JSON
 * object-arrays (exact bytes stashed for retrieval — edit_file is string-based, so a
 * stale match just errors, never corrupts); untouched otherwise. Opt out: VANTA_TOON_READFILE=0,
 * opt in to columnar with VANTA_TOON_DICT=1. */
async function compressReadFile(output: string, vantaDir: string): Promise<{ output: string; tokensSaved: number }> {
  const applied = await applyCodeCompression(output, vantaDir);
  if (applied.tokensSaved > 0) return { output: applied.output, tokensSaved: applied.tokensSaved };
  if (process.env.VANTA_TOON_READFILE === "0") return { output: applied.output, tokensSaved: 0 };
  const toon = output.length >= 400 ? toonCompress(output, { dictionary: toonDict() }) : null;
  if (!toon) return { output: applied.output, tokensSaved: 0 };
  const id = await stashOriginal(vantaDir, output);
  const fmt = toon.startsWith("TOONC ") ? "columnar TOON" : "TOON";
  const out = `${toon}\n[winnow: lossless ${fmt} view of a JSON file (every row kept). The file on disk is unchanged JSON — call retrieve_original id="${id}" for the exact bytes before editing; do not write this view back.]`;
  return { output: out, tokensSaved: Math.max(0, estTokens(output) - estTokens(out)) };
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
  const view = toonView(output);
  if (view) return view;
  if (!shouldCompressTool(toolName)) return { output, tokensSaved: 0 };
  const applied = await applyCompression(output, vantaDir);
  return { output: applied.output, tokensSaved: applied.tokensSaved || 0 };
}
