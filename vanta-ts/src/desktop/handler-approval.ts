import { randomUUID } from "node:crypto";
import http from "node:http";
import { effectAuthority } from "../effects/gate-context.js";
import { executeToolEffect,toolEffectDescriptorSha256 } from "../effects/tool-effect-gateway.js";
import { approvalRunEvent } from "../runs/store.js";
import { approvedMkdirWritableDirs,externalDirectMkdirTarget,shellCommandCwd,shellCommandSafetyAction } from "../tools/shell-cmd.js";
import { approvalDecision,approvalPayload,requestWebApproval,resolveApproval } from "./approval.js";
import { ensureDesktopConversation } from "./handler-conversation.js";
import { readJson,sendJson } from "./handler-http.js";
import { type DesktopState } from "./handler-state.js";

export async function handleApproval(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "GET") {
    const p = state.pendingApproval;
    return sendJson(res, 200, p ? approvalPayload(p) : null);
  }
  const body = await readJson(req) as { id?: unknown; approved?: unknown; decision?: unknown };
  const p = state.pendingApproval;
  if (!p || body.id !== p.id) return sendJson(res, 404, { error: "approval not found" });
  const decision = approvalDecision(body.decision, body.approved);
  // Claim the request before awaiting storage so duplicate submissions cannot run it twice.
  state.pendingApproval = undefined;
  try {
    await resolveApproval(p, decision);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Could not save the approval rule.";
    state.currentRunEvents?.push(approvalRunEvent(p.toolName, reason, "deny"));
    p.resolve(false);
    return sendJson(res, 500, { error: reason });
  }
  state.currentRunEvents?.push(approvalRunEvent(p.toolName, p.reason, decision));
  sendJson(res, 200, { ok: true });
}

export async function handleTerminal(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { command?: unknown };
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!command) return sendJson(res, 400, { error: "command is required" });
  const live = await ensureDesktopConversation(state);
  const tool = live.setup.registry.get("shell_cmd");
  if (!tool) return sendJson(res, 200, { ok: false, output: "unknown tool: shell_cmd" });
  const commandCwd = shellCommandCwd(state.root);
  const action = shellCommandSafetyAction(command, commandCwd);
  const verdict = await live.setup.safety.assess(action);
  if (verdict.risk === "block") return sendJson(res, 200, { ok: false, output: `blocked: ${verdict.reason}` });
  const externalMkdir = externalDirectMkdirTarget(command, commandCwd, state.root);
  const needsApproval = verdict.risk === "ask" || Boolean(externalMkdir);
  const reason = externalMkdir ? `create a directory outside the project root at ${externalMkdir}` : verdict.reason;
  if (needsApproval) {
    const approved = await requestWebApproval(state, action, reason, "shell_cmd");
    if (!approved) return sendJson(res, 200, { ok: false, output: `denied: ${reason}` });
  }
  const effectCallId = `desktop-terminal:${randomUUID()}`;
  const effectCtx = {
    root: state.root,
    sessionId: state.sessionId,
    effectCallId,
    effectApprovalAction: action,
    effectApprovalReusable: true,
    safety: live.setup.safety,
    requestApproval: (action: string, reason: string) => requestWebApproval(state, action, reason, "shell_cmd"),
    sandboxWritableDirs: needsApproval ? approvedMkdirWritableDirs(command, commandCwd) : undefined,
  };
  const result = await executeToolEffect("shell_cmd", {
    command,
  }, tool, {
    ...effectCtx,
    effectAuthority: effectAuthority(
      effectCtx,
      toolEffectDescriptorSha256("shell_cmd", { command }, action),
    ),
  });
  sendJson(res, 200, result);
}
