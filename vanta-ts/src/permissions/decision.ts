import { grantAlways, grantNever } from "./grant.js";

export type PermissionDecision = "allow" | "always" | "deny" | "never";
export type PermissionDecisionResult = {
  approved: boolean;
  decision: PermissionDecision;
  error?: string;
};
type DecisionRequest = { toolName?: string; fresh?: boolean };

/** Shared host contract: a failed persistent choice denies, never silently allows once. */
export async function decidePermission(request: DecisionRequest, decision: PermissionDecision): Promise<PermissionDecisionResult> {
  if (request.fresh && decision === "always") return { approved: false, decision: "deny" };
  if (decision === "always" || decision === "never") {
    if (!request.toolName) return denied("Cannot save an approval rule without a tool name.");
    try {
      if (decision === "always") await grantAlways(request.toolName);
      else await grantNever(request.toolName);
    } catch {
      return denied("Could not save the approval rule. The action was not approved.");
    }
  }
  return { approved: decision === "allow" || decision === "always", decision };
}

function denied(error: string): PermissionDecisionResult {
  return { approved: false, decision: "deny", error };
}
