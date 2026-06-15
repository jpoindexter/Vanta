import { buildPermissionRequest } from "../permissions/request.js";
import { grantAlways, grantNever } from "../permissions/grant.js";

export type PendingApproval = {
  id: string;
  action: string;
  reason: string;
  toolName?: string;
  resolve: (approved: boolean) => void;
};

export type ApprovalDecision = "allow" | "always" | "deny" | "never";
type ApprovalHost = { pendingApproval?: PendingApproval };

export function approvalDecision(decision: unknown, approved: unknown): ApprovalDecision {
  if (decision === "always" || decision === "deny" || decision === "never") return decision;
  if (decision === "allow") return "allow";
  return approved ? "allow" : "deny";
}

export function approvalPayload(p: PendingApproval): unknown {
  return { id: p.id, action: p.action, reason: p.reason, toolName: p.toolName, request: buildPermissionRequest(p) };
}

export async function resolveApproval(p: PendingApproval, decision: ApprovalDecision): Promise<void> {
  if (decision === "always") await grantAlways(p.toolName).catch(() => {});
  if (decision === "never") await grantNever(p.toolName).catch(() => {});
  p.resolve(decision === "allow" || decision === "always");
}

export async function requestWebApproval(host: ApprovalHost, action: string, reason: string, toolName?: string): Promise<boolean> {
  if (host.pendingApproval) return false;
  return new Promise<boolean>((resolve) => {
    host.pendingApproval = { id: `${Date.now()}`, action, reason, toolName, resolve };
  });
}
