import { requestWebApproval } from "./approval.js";
import { fail, succeed, type CompanyCtx, type Outcome } from "./company-context.js";

// Exact-action approval for company writes that grant new authority (hire,
// budget raise). It is the same flow tools use: the request blocks on
// requestWebApproval, the renderer sees `approval.request` on SSE or via
// GET /api/approval, and POST /api/approval releases it. The approval is fresh
// (one time): a saved "always" rule cannot stand in for it.

export type ApprovalSpec = { tool: string; action: string; reason: string };

export async function requireOwnerApproval(ctx: CompanyCtx, spec: ApprovalSpec): Promise<Outcome<true>> {
  if (ctx.state.pendingApproval) {
    return fail(409, "another approval is pending in this session. Resolve it with POST /api/approval, then retry.");
  }
  const approved = await requestWebApproval(ctx.state, spec.action, spec.reason, {
    toolName: spec.tool,
    detail: { fresh: true, canRemember: false },
  });
  return approved ? succeed(true) : fail(403, `declined: ${spec.action}`);
}
