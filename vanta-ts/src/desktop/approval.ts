import { buildPermissionRequest } from "../permissions/request.js";
import { decidePermission, type PermissionDecision, type PermissionDecisionResult } from "../permissions/decision.js";

export type PendingApproval = {
  id: string;
  action: string;
  reason: string;
  toolName?: string;
  detail?: { diff?: string; fresh?: boolean };
  resolve: (approved: boolean) => void;
};

export type ApprovalDecision = PermissionDecision;
type ApprovalHost = { pendingApproval?: PendingApproval };

export function approvalDecision(decision: unknown, approved: unknown): ApprovalDecision {
  if (decision === "always" || decision === "deny" || decision === "never") return decision;
  if (decision === "allow") return "allow";
  return approved ? "allow" : "deny";
}

export function approvalPayload(p: PendingApproval): unknown {
  return { id: p.id, action: p.action, reason: p.reason, toolName: p.toolName, request: buildPermissionRequest(p) };
}

export async function resolveApproval(p: PendingApproval, decision: ApprovalDecision): Promise<PermissionDecisionResult> {
  const result = await decidePermission({ toolName: p.toolName, fresh: p.detail?.fresh }, decision);
  if (result.error) throw new Error(result.error);
  p.resolve(result.approved);
  return result;
}

export async function requestWebApproval(host: ApprovalHost, action: string, reason: string, toolName?: string, detail?: { diff?: string; fresh?: boolean }): Promise<boolean> {
  if (host.pendingApproval) return false;
  return new Promise<boolean>((resolve) => {
    host.pendingApproval = { id: `${Date.now()}`, action, reason, toolName, detail, resolve };
  });
}
