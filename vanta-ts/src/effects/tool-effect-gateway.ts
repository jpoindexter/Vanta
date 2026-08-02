import type { ReceiptDisposition } from "../work-items/contract.js";
import type { HostEffectOutcome } from "../agent/effect-persistence.js";
import type { Tool, ToolContext, ToolResult } from "../tools/types.js";
import {
  executeEffect,
  effectDescriptorSha256,
  payloadSha256,
  stableEffectId,
  type EffectGateContext,
  type EffectIntent,
} from "./execute-effect.js";
import { effectAuthority, effectScope } from "./gate-context.js";

export type ToolEffectPolicy = "read-only" | "gateway";

const callerOwnedPersistence = { persist: async () => {} };

/**
 * Explicitly effect-free tool reads. Everything else fails toward the gateway;
 * new and plugin tools therefore cannot silently gain an execution bypass.
 */
const READ_ONLY_TOOLS = new Set([
  "ask_user",
  "bg_list",
  "bg_status",
  "clarify",
  "code_affected",
  "code_context",
  "code_search",
  "git_diff",
  "git_status",
  "glob_files",
  "graph_query",
  "grep_files",
  "inspect_context",
  "inspect_state",
  "lsp_definition",
  "lsp_diagnostics",
  "lsp_hover",
  "lsp_references",
  "lsp_symbols",
  "read_file",
  "ref_list",
  "ref_search",
  "roadmap_status",
  "sleep",
  "tool_search",
]);

export function toolEffectPolicy(name: string): ToolEffectPolicy {
  if (READ_ONLY_TOOLS.has(name)) return "read-only";
  return "gateway";
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
  return `{${entries.join(",")}}`;
}

export function toolEffectDescriptorSha256(
  name: string,
  args: Record<string, unknown>,
  action: string,
): string {
  return effectDescriptorSha256({
    action,
    kind: `tool.${name}`,
    targetClass: name,
    payloadSha256: payloadSha256(canonical(args)),
  });
}

function gateContext(ctx: ToolContext): EffectGateContext {
  return {
    kernel: ctx.safety,
    approval: {
      request: (request) => request.action === ctx.effectApprovalAction
        ? Promise.resolve(true)
        : ctx.requestApproval(
            request.action,
            request.reason,
            undefined,
            { fresh: true },
          ),
    },
    projectRoot: ctx.root,
    sessionId: ctx.sessionId,
    operationId: ctx.effectCallId,
    scopeId: effectScope(ctx),
    authority: ctx.effectAuthority,
    permissionMode: ctx.permissionMode?.() ?? "default",
  };
}

function disposition(outcome: HostEffectOutcome): ReceiptDisposition {
  if (outcome === "confirmed" || outcome === "verified") return "confirmed";
  if (outcome === "unknown" || outcome === "failed") return "unknown";
  return "denied";
}

function resultDisposition(result: ToolResult, outcome: HostEffectOutcome): ReceiptDisposition {
  if (["denied", "expired", "compensated", "unknown"].includes(result.effectDisposition ?? "")) {
    return result.effectDisposition!;
  }
  return disposition(outcome);
}

function refusedResult(
  name: string,
  outcome: HostEffectOutcome,
  policy?: { risk?: "ask" | "block"; reason?: string },
): ToolResult {
  const refusal = policy?.risk === "block"
    ? `blocked by safety${policy.reason ? `: ${policy.reason}` : ""}`
    : policy?.risk === "ask"
      ? `requires human approval (denied)${policy.reason ? `: ${policy.reason}` : ""}`
      : `effect ${outcome}`;
  return {
    ok: false,
    output: `${name} ${refusal}; inspect current state before any retry because the operation was not confirmed and must not be retried automatically`,
    effectDisposition: disposition(outcome),
    verification: { status: "unverified" },
  };
}

function settledReplayResult(name: string, outcome: "confirmed" | "verified"): ToolResult {
  return {
    ok: true,
    output: `${name} effect was already ${outcome}; the operation was not repeated`,
    effectDisposition: "confirmed",
    verification: { status: outcome === "verified" ? "verified" : "unverified" },
  };
}

function missingOperationId(name: string): ToolResult {
  return {
    ok: false,
    output: `${name} blocked: consequential tool call has no stable operation id`,
    effectDisposition: "denied",
    verification: { status: "unverified" },
  };
}

function driftResult(name: string): ToolResult {
  return {
    ok: false,
    output: `${name} blocked: operation id was already bound to different arguments`,
    effectDisposition: "denied",
    verification: { status: "unverified" },
  };
}

function sameAction(left: string | undefined, right: string): boolean {
  return left?.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

async function authorizeInnerAction(
  ctx: ToolContext,
  authority: NonNullable<ToolContext["effectAuthority"]>,
  action: string,
  reason: string,
  toolName?: string,
  detail?: { diff?: string; fresh?: boolean },
): Promise<boolean> {
  if (authority.consumeExactApproval && sameAction(authority.action, action)) return true;
  let verdict: Awaited<ReturnType<ToolContext["safety"]["assess"]>>;
  try {
    verdict = await ctx.safety.assess(action);
  } catch {
    return false;
  }
  if (verdict.risk === "block") return false;
  return ctx.requestApproval(
    action,
    reason,
    toolName,
    { ...detail, fresh: true },
  );
}

async function authorizeChildEffect(
  ctx: ToolContext,
  intent: Pick<EffectIntent, "action" | "kind" | "targetClass" | "payloadSha256">,
): Promise<"allowed" | "blocked" | "denied"> {
  let verdict: Awaited<ReturnType<ToolContext["safety"]["assess"]>>;
  try {
    verdict = await ctx.safety.assess(intent.action);
  } catch {
    return "blocked";
  }
  if (verdict.risk === "block") return "blocked";
  if (verdict.risk === "allow") return "allowed";
  const approved = await ctx.requestApproval(
    intent.action,
    verdict.reason || "child effect requires approval",
    undefined,
    { fresh: true },
  );
  return approved ? "allowed" : "denied";
}

async function executeGatewayEffect(
  name: string,
  args: Record<string, unknown>,
  tool: Tool,
  ctx: ToolContext,
) {
  const hash = payloadSha256(canonical(args));
  const seed = {
    host: "ordinary-tool-gateway",
    kind: `tool.${name}`,
    targetClass: name,
    payloadSha256: hash,
    idempotencyKey: `tool:${ctx.effectScopeId ?? ctx.sessionId ?? "direct"}:${ctx.effectCallId}`,
  };
  const action = tool.describeForSafety?.(args) ?? `execute ${name} with payload sha256:${hash}`;
  const intent = { id: stableEffectId(seed), actor: name, action, ...seed };
  const descriptorSha256 = effectDescriptorSha256(intent);
  const authority = effectAuthority(
    ctx,
    descriptorSha256,
    action,
    ctx.effectApprovalReusable,
    (child) => authorizeChildEffect(ctx, child),
  );
  const deps = ctx.effectJournalOwnerId === ctx.effectCallId
    ? { persistence: callerOwnedPersistence }
    : undefined;
  return executeEffect(intent, gateContext(ctx), async () => {
    const value = await tool.execute(args, {
      ...ctx,
      effectAuthority: authority,
      requestApproval: (innerAction, reason, toolName, detail) => authorizeInnerAction(
        ctx,
        authority!,
        innerAction,
        reason,
        toolName,
        detail,
      ),
    });
    return {
      value,
      acknowledgementId: `tool:${name}:${ctx.effectCallId}`,
      readbackSha256: value.verification?.status === "verified"
        ? payloadSha256(value.verification.evidence ?? value.output)
        : undefined,
      verified: value.ok && value.verification?.status === "verified",
      failed: !value.ok,
    };
  }, deps);
}

function gatewayResult(name: string, result: Awaited<ReturnType<typeof executeGatewayEffect>>): ToolResult {
  if (!result.value) {
    return result.outcome === "confirmed" || result.outcome === "verified"
      ? settledReplayResult(name, result.outcome)
      : refusedResult(name, result.outcome, { risk: result.policyRisk, reason: result.policyReason });
  }
  return {
    ...result.value,
    effectDisposition: resultDisposition(result.value, result.outcome),
    verification: result.outcome === "verified"
      ? { status: "verified", evidence: result.value.verification?.evidence }
      : { status: "unverified" },
  };
}

/**
 * The compatibility adapter from a registered Tool to the one effect executor.
 * It describes and measures the call, but never makes a policy decision itself.
 */
export async function executeToolEffect(
  name: string,
  args: Record<string, unknown>,
  tool: Tool,
  ctx: ToolContext,
  options: { forceGateway?: boolean } = {},
): Promise<ToolResult> {
  const policy = toolEffectPolicy(name);
  if (!options.forceGateway && policy !== "gateway") return tool.execute(args, ctx);
  if (!ctx.effectCallId) return missingOperationId(name);
  try {
    return gatewayResult(name, await executeGatewayEffect(name, args, tool, ctx));
  } catch (error) {
    if (error instanceof Error && error.message === "effect claim identity mismatch") return driftResult(name);
    throw error;
  }
}
