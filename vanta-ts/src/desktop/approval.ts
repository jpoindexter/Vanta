import { buildPermissionRequest, type ApprovalDetail } from "../permissions/request.js";
import { grantAlways, grantNever } from "../permissions/grant.js";
import { pushTypedEvent, type TypedEventHost } from "./typed-emit.js";
import { approvalRequestEvent, type ApprovalPayload } from "./typed-events.js";

export type PendingApproval = {
  id: string;
  action: string;
  reason: string;
  toolName?: string;
  /** Project root a saved rule is limited to. */
  root?: string;
  detail?: ApprovalDetail;
  resolve: (approved: boolean) => void;
};

export type ApprovalDecision = "allow" | "always" | "deny" | "never";
type ApprovalHost = TypedEventHost & { pendingApproval?: PendingApproval; root?: string };

export function approvalDecision(decision: unknown, approved: unknown): ApprovalDecision {
  if (decision === "always" || decision === "deny" || decision === "never") return decision;
  if (decision === "allow") return "allow";
  return approved ? "allow" : "deny";
}

export function approvalPayload(p: PendingApproval): ApprovalPayload {
  return { id: p.id, action: p.action, reason: p.reason, toolName: p.toolName, request: buildPermissionRequest(p) };
}

export async function resolveApproval(p: PendingApproval, decision: ApprovalDecision): Promise<void> {
  if (decision === "always" || decision === "never") {
    if (p.detail?.fresh) throw new Error("This action requires one-time approval; a saved rule cannot replace it.");
    if (p.detail?.canRemember === false) throw new Error("This approval policy requires a one-time decision; a saved rule cannot replace it.");
    if (!p.toolName) throw new Error("Cannot save an approval rule without a tool name.");
    try {
      if (decision === "always") await grantAlways(p.toolName, process.env, p.root);
      else await grantNever(p.toolName, process.env, p.root);
    } catch {
      // Do not silently turn a failed persistent choice into a one-time decision.
      throw new Error("Could not save the approval rule. The action was not approved.");
    }
  }
  p.resolve(decision === "allow" || decision === "always");
}

export async function requestWebApproval(host: ApprovalHost, action: string, reason: string, options?: string | Pick<PendingApproval, "toolName" | "detail">): Promise<boolean> {
  const { toolName, detail } = typeof options === "string" ? { toolName: options } : options ?? {};
  if (host.pendingApproval) return false;
  return new Promise<boolean>((resolve) => {
    host.pendingApproval = { id: `${Date.now()}`, action, reason, toolName, root: host.root, detail, resolve };
    // Push alongside (not instead of) the polled GET /api/approval payload.
    pushTypedEvent(host, approvalRequestEvent(approvalPayload(host.pendingApproval)));
  });
}
