import { isAbsolute, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { ToolCall } from "../types.js";
import { canonicalPath, expandHome } from "../tools/writable-zones.js";
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

/** Match the same resolved file target the file tools use, anchored to this project. */
export function delegatedRequestForCall(call: ToolCall, action: string, root: string): DelegatedRequest {
  const args = (call.arguments ?? {}) as Record<string, unknown>;
  const writePath =
    WRITE_TOOLS.has(call.name) && typeof args.path === "string" && args.path.length > 0
      ? canonicalPath(resolve(root, expandHome(args.path)))
      : undefined;
  return { risk: "ask", action, writePath };
}

export type DelegatedGateDeps = {
  root: string;
  readGrants: () => Promise<AuthorityGrant[]>;
  appendAudit: (record: DelegatedAuditRecord) => Promise<void>;
  now?: () => Date;
};

export type DelegatedDecision = { grantId: string; writePath?: string; grantFingerprint: string };

/** Include every authority-bearing field; canonical scope binds aliases to their approved target. */
function grantFingerprint(grant: AuthorityGrant): string {
  const bound = grant.class.kind === "writeScope" ? grant.class.scope : grant.class.maxUsd;
  return createHash("sha256").update(JSON.stringify([
    grant.id, grant.delegator, grant.delegate, grant.class.kind, bound,
    grant.active, grant.grantedAt, grant.revokedAt ?? null,
  ])).digest("hex");
}

function resolvedGrants(grants: AuthorityGrant[]): AuthorityGrant[] {
  return grants.flatMap((grant) => {
    if (grant.class.kind !== "writeScope") return [grant];
    const scope = expandHome(grant.class.scope);
    // Relative legacy scopes have no durable project anchor; require a separate decision.
    return isAbsolute(scope)
      ? [{ ...grant, class: { ...grant.class, scope: canonicalPath(scope) } }]
      : [];
  });
}

/** Removed, duplicate, revoked, changed or unresolvable grants cannot consume an earlier decision. */
export function delegatedDecisionIsCurrent(decision: DelegatedDecision, grants: AuthorityGrant[]): boolean {
  try {
    const matching = grants.filter(grant => grant.id === decision.grantId);
    if (matching.length !== 1 || !matching[0]!.active) return false;
    const current = resolvedGrants(matching)[0];
    return Boolean(current && grantFingerprint(current) === decision.grantFingerprint);
  } catch { return false; }
}

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
): Promise<DelegatedDecision | null> {
  const grants = await deps.readGrants().catch(() => [] as AuthorityGrant[]);
  if (grants.length === 0 || typeof deps.root !== "string" || !isAbsolute(deps.root)) return null;
  const request = delegatedRequestForCall(call, action, deps.root);
  const result = checkDelegated(request, resolvedGrants(grants));
  if (!result.autoApprove || !result.byGrant) return null;
  const record = auditDelegatedDecision(result.byGrant, action, deps.now?.() ?? new Date());
  try {
    await deps.appendAudit(record);
  } catch {
    return null;
  }
  return { grantId: result.byGrant.id, writePath: request.writePath, grantFingerprint: grantFingerprint(result.byGrant) };
}
