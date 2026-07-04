import type { ToolCall } from "../types.js";
import {
  checkDelegated,
  auditDelegatedDecision,
  type DelegatedRequest,
  type AuthorityGrant,
  type DelegatedAuditRecord,
} from "../cofounder/authority-model.js";

/**
 * DELEGATED-AUTHORITY-WIRE — consult the owner's authority grants at the ASK
 * approval site. An Ask-tier action that falls within an ACTIVE grant's bound
 * (a write inside a granted scope) is auto-approved WITHOUT a human prompt and
 * the decision is written to the audit log. Everything else — no grant, an
 * out-of-bound write, and (upstream) any kernel BLOCK — still prompts.
 *
 * Safety: this only ever runs in the `ask` branch (block is handled above and
 * never reaches here), and `checkDelegated` is default-deny + never auto-
 * approves a non-ask risk. With NO active grants the read returns [] and the
 * approval path is byte-identical to before — the common case pays only one
 * small file read that resolves to "no delegation".
 */

/** Tools whose args carry a write target, matched against a writeScope grant. */
const WRITE_TOOLS: ReadonlySet<string> = new Set(["write_file", "edit_file"]);

/** Build the delegated request for a tool call at the ASK site. Pure. */
export function delegatedRequestForCall(call: ToolCall, action: string): DelegatedRequest {
  const args = (call.arguments ?? {}) as Record<string, unknown>;
  const writePath =
    WRITE_TOOLS.has(call.name) && typeof args.path === "string" && args.path.length > 0
      ? args.path
      : undefined;
  return { risk: "ask", action, writePath };
}

export type DelegatedGateDeps = {
  readGrants: () => Promise<AuthorityGrant[]>;
  appendAudit: (record: DelegatedAuditRecord) => Promise<void>;
  now?: () => Date;
};

/**
 * If an active grant covers this Ask action, log the delegated decision and
 * return the grant id (caller auto-approves). Returns null to fall through to
 * the normal human prompt. Never throws — a grant-read or audit-write failure
 * degrades to "no delegation" (the human prompt), never an auto-approve.
 */
export async function tryDelegatedAutoApprove(
  call: ToolCall,
  action: string,
  deps: DelegatedGateDeps,
): Promise<{ grantId: string } | null> {
  const grants = await deps.readGrants().catch(() => [] as AuthorityGrant[]);
  if (grants.length === 0) return null;
  const result = checkDelegated(delegatedRequestForCall(call, action), grants);
  if (!result.autoApprove || !result.byGrant) return null;
  const record = auditDelegatedDecision(result.byGrant, action, deps.now?.() ?? new Date());
  await deps.appendAudit(record).catch(() => {});
  return { grantId: result.byGrant.id };
}
