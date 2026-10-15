import { randomUUID } from "node:crypto";
import { applySafetyGate } from "../agent/dispatch-helpers.js";
import { isPlanBlocked } from "../agent/plan-gate.js";
import type { AgentDeps } from "../agent/agent-types.js";
import { effectAuthority } from "../effects/gate-context.js";
import { executeToolEffect, toolEffectDescriptorSha256 } from "../effects/tool-effect-gateway.js";
import { resolveOperatingMode } from "../modes/operating-mode.js";
import { externalDirectMkdirTargets, shellCommandCwd, shellCommandSafetyAction } from "../tools/shell-cmd.js";
import type { ToolContext, ToolResult } from "../tools/types.js";
import { permissionModeForAccess } from "./access-mode.js";
import { requestWebApproval } from "./approval.js";
import { ensureDesktopConversation } from "./handler-conversation.js";
import type { DesktopState } from "./handler-state.js";

/** Terminal shares permission policy with chat but retains its own durable effect journal. */
export async function runDesktopTerminal(state: DesktopState, command: string): Promise<ToolResult> {
  const live = await ensureDesktopConversation(state);
  if (isPlanBlocked("shell_cmd", () => state.accessMode === "plan" || resolveOperatingMode(process.env) === "plan")) {
    return { ok: false, output: "blocked: plan mode is active — terminal execution is unavailable." };
  }
  const tool = live.setup.registry.get("shell_cmd");
  if (!tool) return { ok: false, output: "unknown tool: shell_cmd" };
  const cwd = shellCommandCwd(state.root);
  const action = shellCommandSafetyAction(command, cwd);
  const external = externalDirectMkdirTargets(command, cwd, state.root);
  const fresh = external.length > 0 || state.forceFreshApprovals === true;
  const requestApproval: AgentDeps["requestApproval"] = (action, reason, toolName, detail) =>
    requestWebApproval(state, action, external.length ? `Create directories outside the project: ${external.join(", ")}` : reason,
      { toolName, detail: { ...detail, ...(fresh ? { fresh: true } : {}) } });
  const permissionMode = () => permissionModeForAccess(state.accessMode ?? "approve");
  const call = { id: `desktop-terminal:${randomUUID()}`, name: "shell_cmd", arguments: { command } };
  const ctx: ToolContext = { root: state.root, sessionId: state.sessionId, safety: live.setup.safety, requestApproval, permissionMode, effectCallId: call.id };
  const deps: AgentDeps = { ...ctx, provider: live.setup.provider, registry: live.setup.registry, forceFreshApproval: () => fresh };
  const gate = await applySafetyGate(call, deps, ctx);
  if (!gate.approved) return { ok: false, output: gate.reason ?? "approval denied" };
  const approvedAction = gate.effectApprovalAction ?? action;
  // This wrapper binds only this immutable command to its exact assessed descriptor,
  // including resolved outside-project targets. It does not authorize another command.
  const scopedTool = { ...tool, describeForSafety: () => approvedAction };
  const effectCtx = { ...ctx, effectApprovalAction: approvedAction, effectApprovalReusable: gate.effectApprovalReusable, sandboxWritableDirs: gate.sandboxWritableDirs };
  return executeToolEffect(call.name, call.arguments, scopedTool, {
    ...effectCtx,
    effectAuthority: effectAuthority(effectCtx, toolEffectDescriptorSha256(call.name, call.arguments, approvedAction)),
  });
}
