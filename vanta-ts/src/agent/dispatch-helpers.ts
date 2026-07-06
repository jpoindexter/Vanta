import type { KernelClient } from "../kernel/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import type { ToolCall, Verdict } from "../types.js";
import type { AgentDeps } from "../agent.js";
import { shouldWarn, buildSelfMonitorText } from "../repl/self-monitor.js";
import { shouldRetryTool, resolveToolRetries } from "../tool-retry.js";
import { applyCompression, compressEnabled, shouldCompressTool } from "../compress/apply.js";
import { densifySearchResult, shouldDensifyTool } from "../compress/search-densify.js";
import { toonView, compressReadFile } from "./toon-output.js";
import { tryDelegatedAutoApprove } from "./delegated-gate.js";
import { readGrants, appendAuditRecord } from "../cofounder/delegated-authority.js";
import { resolveLayeredDecision } from "./decision-chain.js";
import { appendPreferenceSignal, signalFromApprovalDecision } from "../preferences/signals.js";
import { acceptsEditsWithoutKernel, resolvePermissionMode } from "../modes/permission-mode.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { buildPermDeniedPayload, shouldFirePermDenied } from "../hooks/perm-denied.js";
import { gateAuditEvent, type GateResolution } from "../governance/audit.js";
import { join } from "node:path";

export type SafetyGateResult = { approved: boolean; reason?: string };

/** PAPER-GOVERNANCE-AUDIT: log one durable, tamper-evident `gate` event per
 *  applySafetyGate exit — the kernel's raw verdict plus how it was finally
 *  resolved. Best-effort (never blocks the turn on a log failure). */
async function auditGate(
  deps: AgentDeps,
  o: { tool: string; action: string; risk: Verdict["risk"] | "unknown"; resolution: GateResolution },
): Promise<void> {
  try {
    await deps.safety.logEvent(gateAuditEvent(o));
  } catch {
    /* best-effort — an audit-log failure must never block the gate decision */
  }
}

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
    await auditGate(deps, { tool: call.name, action, risk: "unknown", resolution: "kernel-unreachable" });
    return { approved: false, reason: output };
  }

  const decision = await resolveLayeredDecision(verdict, call, action, ctx);

  if (decision.decision === "block") {
    return handleBlockDecision({ call, action, verdict, decision, deps, root: ctx.root });
  }

  if (decision.decision === "ask") {
    return handleAskDecision({ call, action, verdict, decision, deps, root: ctx.root, tool });
  }

  await auditGate(deps, { tool: call.name, action, risk: verdict.risk, resolution: "allow" });
  return { approved: true };
}

/**
 * An `ask` verdict: acceptEdits auto-confirms edit-class tools (only after the
 * kernel ran, so a kernel BLOCK — protected paths: src/*.rs, factory/*, MANIFESTO
 * — is still enforced above); else an active delegated-authority grant
 * auto-approves; else it prompts the human.
 */
/** The one Tool capability the approval path reads (EXT-ACP-EDIT-DIFF). */
type DiffCapable = { describeDiff?: (args: Record<string, unknown>, root: string) => Promise<string | undefined> };

async function handleAskDecision(o: {
  call: ToolCall;
  action: string;
  verdict: Verdict;
  decision: { decision: "allow" | "ask" | "block"; reason: string };
  deps: AgentDeps;
  root: string;
  tool?: DiffCapable;
}): Promise<SafetyGateResult> {
  const { call, action, verdict, decision, deps, root, tool } = o;
  if (acceptsEditsWithoutKernel(resolvePermissionMode(process.env), call.name)) {
    await auditGate(deps, { tool: call.name, action, risk: verdict.risk, resolution: "accept-edits-auto" });
    return { approved: true, reason: "acceptEdits (kernel block still enforced)" };
  }
  // DELEGATED-AUTHORITY-WIRE: an Ask within an active grant's bound is
  // auto-approved (+ audited) without a prompt; no grant → falls through.
  const delegated = await delegatedGateResult(call, action);
  if (delegated) {
    await auditGate(deps, { tool: call.name, action, risk: verdict.risk, resolution: "delegated-auto" });
    return delegated;
  }
  await firePermissionEvent(root, "PermissionRequest", call.name, { tool: call.name, action, reason: decision.reason });
  return handleApprovalRequest({ call, action, verdict, deps, root, tool });
}

/** Delegated-authority auto-approval for an Ask (or null to prompt). Wraps the
 *  pure gate with the real grant store + audit log. */
async function delegatedGateResult(call: ToolCall, action: string): Promise<SafetyGateResult | null> {
  const delegated = await tryDelegatedAutoApprove(call, action, {
    readGrants: () => readGrants(process.env),
    appendAudit: (r) => appendAuditRecord(r, process.env),
  });
  return delegated ? { approved: true, reason: `delegated authority (grant ${delegated.grantId})` } : null;
}

/**
 * A `block` verdict (kernel block, soft-deny rule, or auto-mode classifier deny).
 * Fires PermissionDenied only on a true deny (the pure fire-decision) with the
 * pure-built payload — best-effort, so no configured hook = no behavior change.
 */
async function handleBlockDecision(o: {
  call: ToolCall;
  action: string;
  verdict: Verdict;
  decision: { decision: "allow" | "ask" | "block"; reason: string };
  deps: AgentDeps;
  root: string;
}): Promise<SafetyGateResult> {
  const { call, action, verdict, decision, deps, root } = o;
  const reason = verdict.risk === "block" ? verdict.reason : decision.reason;
  if (shouldFirePermDenied(decision)) await firePermissionEvent(root, "PermissionDenied", call.name, buildPermDeniedPayload(call.name, reason, action));
  deps.onToolResult?.(call.name, false, `blocked: ${reason}`);
  await auditGate(deps, { tool: call.name, action, risk: verdict.risk, resolution: "blocked" });
  return { approved: false, reason: `blocked: ${reason}` };
}

async function handleApprovalRequest(o: {
  call: ToolCall;
  action: string;
  verdict: Verdict;
  deps: AgentDeps;
  root: string;
  tool?: DiffCapable;
}): Promise<SafetyGateResult> {
  const { call, action, verdict, deps, root } = o;
  const why = verdict.reason || "permission rule";
  // EXT-ACP-EDIT-DIFF: file tools attach an old/new preview to the ask.
  const diff = await o.tool?.describeDiff?.(call.arguments, root).catch(() => undefined);
  const approved = await deps.requestApproval(action, why, call.name, diff ? { diff } : undefined);
  await recordApprovalSignal(call.name, action, why, approved);
  // Reconcile the kernel approval queue ONLY when the kernel itself asked.
  // Queue bookkeeping is best-effort — a kernel hiccup must not abort the turn.
  const id = verdict.risk === "ask" ? await deps.safety.proposeApproval(action).catch(() => null) : null;
  if (!approved) {
    if (id) await deps.safety.deny(id).catch(() => {});
    await firePermissionEvent(root, "PermissionDenied", call.name, { tool: call.name, action, reason: why });
    deps.onToolResult?.(call.name, false, "denied by user");
    await auditGate(deps, { tool: call.name, action, risk: verdict.risk, resolution: "denied" });
    return { approved: false, reason: `denied by user: ${why}` };
  }
  if (id) await deps.safety.approve(id).catch(() => {});
  await auditGate(deps, { tool: call.name, action, risk: verdict.risk, resolution: "approved" });
  return { approved: true };
}

async function firePermissionEvent(root: string | undefined, event: "PermissionRequest" | "PermissionDenied", toolName: string, context: Record<string, unknown>): Promise<void> {
  if (!root) return;
  await fireHooks(join(root, ".vanta"), event, context, { cwd: root, toolName, matcherValue: toolName }).catch(() => {});
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
