import { join } from "node:path";
import { appendAuditRecord,readGrants } from "../cofounder/delegated-authority.js";
import { gateAuditEvent,type GateResolution } from "../governance/audit.js";
import { buildPermDeniedPayload,shouldFirePermDenied } from "../hooks/perm-denied.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { acceptsEditsWithoutKernel,resolvePermissionMode } from "../modes/permission-mode.js";
import { appendPreferenceSignal,signalFromApprovalDecision } from "../preferences/signals.js";
import type { ToolCall,Verdict } from "../types.js";
import type { AgentDeps } from "./agent-types.js";
import { autoApproveOverridden,recordAutoDecision } from "./decision-log.js";
import { tryDelegatedAutoApprove } from "./delegated-gate.js";
import type { DiffCapable,SafetyGateResult } from "./dispatch-safety-types.js";
import { persistApprovalTransition } from "./effect-persistence.js";
import type { ApprovalDetail } from "../permissions/request.js";
import type { Decision } from "./decision-chain.js";

/** PAPER-GOVERNANCE-AUDIT: log one durable, tamper-evident `gate` event per
 *  applySafetyGate exit — the kernel's raw verdict plus how it was finally
 *  resolved. Best-effort (never blocks the turn on a log failure). */
export async function auditGate(
  deps: AgentDeps,
  o: { tool: string; action: string; risk: Verdict["risk"] | "unknown"; resolution: GateResolution },
): Promise<void> {
  try {
    await deps.safety.logEvent(gateAuditEvent(o));
  } catch {
    /* best-effort — an audit-log failure must never block the gate decision */
  }
}

export async function handleAskDecision(o: {
  call: ToolCall;
  action: string;
  verdict: Verdict;
  decision: Decision;
  deps: AgentDeps;
  root: string;
  tool?: DiffCapable;
  permissionMode: ReturnType<typeof resolvePermissionMode>;
}): Promise<SafetyGateResult> {
  const { call, action, verdict, decision, deps, root, tool, permissionMode } = o;
  // DECISION-CLASSIFIER: a blanket auto-approve grant must NOT silently clear a
  // decision that overrides the operator's stated direction (user-challenge) —
  // it is forced to the prompt below. Taste decisions auto-decide but are logged
  // for the final-gate batch. Guarded so a grantless run is byte-identical.
  const overridesDirection = autoApproveOverridden(action, deps.activeGoalText);
  if (!overridesDirection && acceptsEditsWithoutKernel(permissionMode, call.name)) {
    recordAutoDecision(action, deps.activeGoalText); // log a taste auto-decision for the final gate
    await auditGate(deps, { tool: call.name, action, risk: verdict.risk, resolution: "accept-edits-auto" });
    return { approved: true, reason: "acceptEdits (kernel block still enforced)" };
  }
  // DELEGATED-AUTHORITY-WIRE: an Ask within an active grant's bound is
  // auto-approved (+ audited) without a prompt; no grant → falls through.
  const delegated = overridesDirection ? null : await delegatedGateResult(call, action);
  if (delegated) {
    recordAutoDecision(action, deps.activeGoalText);
    await auditGate(deps, { tool: call.name, action, risk: verdict.risk, resolution: "delegated-auto" });
    return delegated;
  }
  await firePermissionEvent(root, "PermissionRequest", call.name, { tool: call.name, action, reason: decision.reason });
  return handleApprovalRequest({ call, action, verdict, decision, deps, root, tool });
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
export async function handleBlockDecision(o: {
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

export async function handleApprovalRequest(o: {
  call: ToolCall;
  action: string;
  verdict: Verdict;
  decision?: Decision;
  deps: AgentDeps;
  root: string;
  tool?: DiffCapable;
  fresh?: boolean;
}): Promise<SafetyGateResult> {
  const { call, action, verdict, deps, root } = o;
  const why = o.decision?.canRemember === false ? o.decision.reason : verdict.reason || "permission rule";
  // EXT-ACP-EDIT-DIFF: file tools attach an old/new preview to the ask.
  const diff = await o.tool?.describeDiff?.(call.arguments, root).catch(() => undefined);
  await persistApprovalTransition(root, deps.sessionId, call, action, "requested");
  let approved: boolean;
  try {
    const detail = approvalDetail(o.fresh, diff, o.decision?.canRemember);
    approved = await deps.requestApproval(action, why, call.name, detail);
  } catch (error) {
    await persistApprovalTransition(root, deps.sessionId, call, action, "expired");
    throw error;
  }
  await persistApprovalTransition(root, deps.sessionId, call, action, approved ? "approved" : "denied");
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


function approvalDetail(fresh?: boolean, diff?: string, canRemember?: boolean): ApprovalDetail | undefined {
  const detail = { ...(fresh ? { fresh: true } : {}), ...(diff ? { diff } : {}),
    ...(canRemember === false ? { canRemember: false } : {}) };
  return Object.keys(detail).length ? detail : undefined;
}
