import { resolvePermissionMode } from "../modes/permission-mode.js";
import type { EffectAuthority, ToolContext } from "../tools/types.js";
import type { EffectGateContext } from "./execute-effect.js";

/** Bind an effect to its caller-owned operation, scope, and exact descriptor. */
export function effectScope(ctx: ToolContext): string {
  return ctx.effectScopeId ?? ctx.sessionId ?? "direct";
}

export function effectAuthority(
  ctx: ToolContext,
  descriptorSha256: string,
  action = ctx.effectApprovalAction,
  consumeExactApproval = ctx.effectApprovalReusable ?? false,
  authorizeChild?: NonNullable<EffectAuthority["authorizeChild"]>,
): EffectAuthority | undefined {
  if (!ctx.effectCallId) return undefined;
  const scopeId = effectScope(ctx);
  if (
    ctx.effectAuthority?.operationId === ctx.effectCallId
    && ctx.effectAuthority.scopeId === scopeId
    && ctx.effectAuthority.descriptorSha256 === descriptorSha256
  ) {
    return { ...ctx.effectAuthority, authorizeChild: authorizeChild ?? ctx.effectAuthority.authorizeChild };
  }
  return { operationId: ctx.effectCallId, scopeId, descriptorSha256, action, consumeExactApproval, authorizeChild };
}

export function effectOperationKey(prefix: string, ctx: ToolContext): string {
  const scope = effectScope(ctx);
  return `${prefix}:${scope}:${ctx.effectCallId ?? "direct-call"}`;
}

/** Adapt the existing host-owned tool authority into the shared effect gate. */
export function effectGateFromToolContext(ctx: ToolContext): EffectGateContext {
  return {
    kernel: ctx.safety,
    approval: {
      request: (request) => ctx.requestApproval(
        request.action,
        request.reason,
        "effect_gate",
        { fresh: true },
      ),
    },
    projectRoot: ctx.root,
    sessionId: ctx.sessionId,
    operationId: ctx.effectCallId,
    scopeId: effectScope(ctx),
    authority: ctx.effectAuthority,
    permissionMode: ctx.permissionMode?.() ?? resolvePermissionMode(process.env),
  };
}
