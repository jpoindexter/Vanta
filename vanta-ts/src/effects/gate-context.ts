import { resolvePermissionMode } from "../modes/permission-mode.js";
import type { ToolContext } from "../tools/types.js";
import type { EffectGateContext } from "./execute-effect.js";

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
    permissionMode: ctx.permissionMode?.() ?? resolvePermissionMode(process.env),
  };
}
