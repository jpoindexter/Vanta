import { resolvePermissionMode } from "../modes/permission-mode.js";
import { approvedMkdirWritableDirs,externalDirectMkdirTargets,shellCommandCwd,shellCommandSafetyAction } from "../tools/shell-cmd.js";
import type { ToolContext } from "../tools/types.js";
import type { ToolCall,Verdict } from "../types.js";
import type { AgentDeps } from "./agent-types.js";
import { resolveLayeredDecision } from "./decision-chain.js";
import { recordAutoDecision } from "./decision-log.js";
import { auditGate,handleApprovalRequest,handleAskDecision,handleBlockDecision } from "./dispatch-approval.js";
import type { DiffCapable,SafetyGateResult } from "./dispatch-safety-types.js";

type Subject = { call: ToolCall; action: string; shellCwd: string; localShell: boolean };
type Decision = Awaited<ReturnType<typeof resolveLayeredDecision>>;
type Ask = Subject & { verdict: Verdict; decision: Decision; deps: AgentDeps; root: string; tool: DiffCapable;
  permissionMode: ReturnType<typeof resolvePermissionMode>; fresh: boolean };

/** Kernel assessment remains mandatory and precedes every local approval rule. */
export async function applySafetyGate(call: ToolCall, deps: AgentDeps, ctx: ToolContext): Promise<SafetyGateResult> {
  const tool = deps.registry.get(call.name);
  if (!tool) return { approved: false, reason: `unknown tool: ${call.name}` };
  const subject = describeSubject(call, tool.describeForSafety?.(call.arguments), ctx.root);
  const assessment = await assess(subject, deps);
  if ("failure" in assessment) return assessment.failure;
  const { verdict } = assessment;
  const decision = await resolveLayeredDecision(verdict, call, subject.action, ctx);
  const fresh = deps.forceFreshApproval?.() === true;
  const effective = effectiveDecision(subject, ctx.root, { decision, verdict, fresh });
  const permissionMode = ctx.permissionMode?.() ?? resolvePermissionMode(process.env);
  const request = { ...subject, verdict, decision: effective, deps, root: ctx.root, tool, permissionMode, fresh };
  if (effective.decision === "block") return handleBlockDecision(request);
  if (effective.decision === "ask") return resolveAsk(request);
  await auditGate(deps, { tool: call.name, action: subject.action, risk: verdict.risk, resolution: "allow" });
  return { approved: true, effectApprovalAction: subject.action,
    effectApprovalReusable: !fresh && (verdict.risk === "ask" || permissionMode === "fullAccess") };
}

function describeSubject(call: ToolCall, described: string | undefined, root: string): Subject {
  const description = described ?? `${call.name} ${JSON.stringify(call.arguments)}`;
  const localShell = call.name === "shell_cmd" && typeof call.arguments.command === "string" && !call.arguments.ssh && !process.env.VANTA_SSH_SESSION;
  const shellCwd = localShell ? shellCommandCwd(root) : root;
  const action = localShell ? shellCommandSafetyAction(String(call.arguments.command ?? ""), shellCwd) : description;
  return { call, action, localShell: Boolean(localShell), shellCwd };
}

async function assess(subject: Subject, deps: AgentDeps): Promise<{ verdict: Verdict } | { failure: SafetyGateResult }> {
  try {
    return { verdict: await deps.safety.assess(subject.action) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = `blocked: safety kernel unreachable (${message}) — restart vanta to relaunch it`;
    deps.onToolResult?.(subject.call.name, false, output);
    await auditGate(deps, { tool: subject.call.name, action: subject.action, risk: "unknown", resolution: "kernel-unreachable" });
    return { failure: { approved: false, reason: output } };
  }
}

function effectiveDecision(subject: Subject, root: string, policy: { decision: Decision; verdict: Verdict; fresh: boolean }): Decision {
  const { decision, verdict, fresh } = policy;
  const replay = fresh && verdict.risk === "ask" && decision.decision !== "block"
    ? { decision: "ask" as const, reason: "replay requires a fresh approval" } : decision;
  const external = subject.localShell ? externalDirectMkdirTargets(String(subject.call.arguments.command), subject.shellCwd, root) : [];
  return replay.decision === "allow" && external.length > 0
    ? { decision: "ask", reason: `create directories outside the project root at ${external.join(", ")}` } : replay;
}

async function resolveAsk(request: Ask): Promise<SafetyGateResult> {
  if (request.fresh) {
    const result = await handleApprovalRequest(request);
    return bindApproval(result, request, false);
  }
  if (request.permissionMode === "fullAccess") {
    recordAutoDecision(request.action, request.deps.activeGoalText);
    await auditGate(request.deps, { tool: request.call.name, action: request.action, risk: request.verdict.risk, resolution: "full-access-auto" });
    return bindApproval({ approved: true, reason: "full access (kernel and explicit blocks remain enforced)" }, request, true);
  }
  return bindApproval(await handleAskDecision(request), request, true);
}

function bindApproval(result: SafetyGateResult, subject: Subject, reusable: boolean): SafetyGateResult {
  if (!result.approved) return result;
  return { ...result, effectApprovalAction: subject.action, effectApprovalReusable: reusable,
    ...(subject.call.name === "shell_cmd"
      ? { sandboxWritableDirs: approvedMkdirWritableDirs(String(subject.call.arguments.command ?? ""), subject.shellCwd) } : {}) };
}
