import http from "node:http";
import { approvalRunEvent } from "../runs/store.js";
import { approvalDecision,approvalPayload,resolveApproval } from "./approval.js";
import { runDesktopTerminal } from "./terminal-tool.js";
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
  sendJson(res, 200, await runDesktopTerminal(state, command));
}
