import type { ToolCall } from "../types.js";
import type { ToolContext } from "../tools/types.js";
import type { AgentDeps } from "./agent-types.js";
import { acceptsEditsWithoutKernel, resolvePermissionMode } from "../modes/permission-mode.js";
import { loadRules } from "../permissions/store.js";
import { matchRule } from "../permissions/rules.js";
import { persistApprovalTransition } from "./effect-persistence.js";
import { sameEffectAction } from "../effects/action-identity.js";

async function savedExactChoice(call: ToolCall, deps: AgentDeps, action: string, toolName?: string): Promise<boolean | null> {
  const original = deps.registry.get(call.name)?.describeForSafety?.(call.arguments);
  if (!original || toolName !== call.name || !sameEffectAction(original, action)) return null;
  const rule = matchRule(await loadRules(process.env), call.name, original);
  if (rule === "allow") return true;
  if (rule === "deny") return false;
  return null;
}

export function executionContext(call: ToolCall, deps: AgentDeps, ctx: ToolContext, forceFreshApproval = false): ToolContext {
  const mode = ctx.permissionMode?.() ?? resolvePermissionMode(process.env);
  const autoApprove = !forceFreshApproval && (mode === "fullAccess" || acceptsEditsWithoutKernel(mode, call.name));
  return {
    ...ctx,
    requestApproval: async (action, reason, requestedToolName, detail) => {
      if (forceFreshApproval) detail = { ...detail, fresh: true };
      if (!detail?.fresh) {
        const saved = await savedExactChoice(call, deps, action, requestedToolName);
        if (saved !== null) return saved;
        return autoApprove ? true : ctx.requestApproval(action, reason, requestedToolName, detail);
      }
      await persistApprovalTransition(ctx.root, deps.sessionId, call, action, "requested");
      try {
        const approved = await ctx.requestApproval(action, reason, requestedToolName, detail);
        await persistApprovalTransition(ctx.root, deps.sessionId, call, action, approved ? "approved" : "denied");
        return approved;
      } catch (error) {
        await persistApprovalTransition(ctx.root, deps.sessionId, call, action, "expired");
        throw error;
      }
    },
  };
}
