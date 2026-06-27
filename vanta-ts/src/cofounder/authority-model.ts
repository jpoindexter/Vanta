import { z } from "zod";
import { resolveInScope } from "../scope.js";
import type { Risk } from "../types.js";

// COFOUNDER-DELEGATED-AUTHORITY (pure model) — an owner grants a manager bounded
// authority over an approval CLASS (spend <= $X, or file writes inside scope Y).
// An Ask-class action that falls within an active grant's bound is auto-approved
// by the manager up to the bound, and a tamper-evident-by-append audit record is
// built for it. The grant model, bound-check, and audit-record builders take no
// I/O. The store + audit log live in delegated-authority.ts (re-exported here).
//
// HARD INVARIANTS (the security floor, never delegated):
//   - A Block-floor request is NEVER auto-approved — only Ask-class delegates.
//   - Default-deny: anything not provably inside an active grant's bound → no.
//   - The kernel block floor is enforced upstream; this layer only ever decides
//     whether an Ask becomes an auto-approve. It cannot upgrade a Block.

/** A bounded approval class an owner can delegate. */
export const AuthorityClassSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("spend"), maxUsd: z.number().positive() }),
  z.object({ kind: z.literal("writeScope"), scope: z.string().min(1) }),
]);
export type AuthorityClass = z.infer<typeof AuthorityClassSchema>;

export const AuthorityGrantSchema = z.object({
  id: z.string().min(1),
  delegator: z.string().min(1),
  delegate: z.string().min(1),
  class: AuthorityClassSchema,
  active: z.boolean().default(true),
  grantedAt: z.string().min(1),
  revokedAt: z.string().optional(),
});
export type AuthorityGrant = z.infer<typeof AuthorityGrantSchema>;

/** The Ask-class request a grant is checked against. */
export type DelegatedRequest = {
  /** Kernel risk class. Only "ask" is ever delegable; "block" is the floor. */
  risk: Risk;
  /** Human-readable action text (recorded in the audit log). */
  action: string;
  /** Spend amount in USD, when the request is a spend. */
  amountUsd?: number;
  /** Absolute target path, when the request is a file write. */
  writePath?: string;
};

export type CheckResult = { autoApprove: boolean; byGrant?: AuthorityGrant };

export type DelegatedAuditRecord = {
  delegator: string;
  delegate: string;
  action: string;
  grantId: string;
  at: string;
};

export type GrantResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Derive a stable, unique grant id for a delegator→delegate pair. Pure. */
export function deriveGrantId(existing: AuthorityGrant[], delegator: string, delegate: string): string {
  const base = `${slug(delegator)}-${slug(delegate)}`;
  const taken = new Set(existing.map((g) => g.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export type GrantSpec = { delegator: string; delegate: string; class: AuthorityClass };

/**
 * Grant a manager bounded authority. Pure — the caller persists the result.
 * Errors-as-values; refuses empty parties or a non-positive spend bound.
 */
export function grantAuthority(
  existing: AuthorityGrant[],
  spec: GrantSpec,
  now: Date = new Date(),
): GrantResult<AuthorityGrant> {
  const delegator = spec.delegator.trim();
  const delegate = spec.delegate.trim();
  if (!delegator) return { ok: false, error: "delegator is required" };
  if (!delegate) return { ok: false, error: "delegate is required" };
  if (delegator === delegate) return { ok: false, error: "an owner cannot delegate authority to themselves" };
  const parsed = AuthorityClassSchema.safeParse(spec.class);
  if (!parsed.success) return { ok: false, error: "class must be a spend (maxUsd>0) or writeScope (scope)" };

  const grant: AuthorityGrant = {
    id: deriveGrantId(existing, delegator, delegate),
    delegator,
    delegate,
    class: parsed.data,
    active: true,
    grantedAt: now.toISOString(),
  };
  return { ok: true, value: grant };
}

/**
 * Revoke a grant by id — marks it inactive (never deleted, for audit). Pure.
 * Returns the updated list. Errors when the id is unknown.
 */
export function revokeAuthority(
  existing: AuthorityGrant[],
  id: string,
  now: Date = new Date(),
): GrantResult<AuthorityGrant[]> {
  if (!existing.some((g) => g.id === id)) return { ok: false, error: `unknown grant "${id}"` };
  const at = now.toISOString();
  return {
    ok: true,
    value: existing.map((g) => (g.id === id ? { ...g, active: false, revokedAt: at } : g)),
  };
}

/**
 * The bound check. Returns autoApprove TRUE ONLY when the request is Ask-class
 * AND falls within an ACTIVE grant's bound (spend within maxUsd, or a write
 * inside scope). A Block-floor request, a revoked grant, an out-of-bound spend,
 * or an out-of-scope write all return FALSE (default-deny). Pure.
 */
export function checkDelegated(request: DelegatedRequest, grants: AuthorityGrant[]): CheckResult {
  // SECURITY FLOOR: only Ask-class is ever delegable. Block (and anything that
  // is not explicitly "ask") is never auto-approved.
  if (request.risk !== "ask") return { autoApprove: false };

  for (const grant of grants) {
    if (!grant.active) continue;
    if (withinBound(grant.class, request)) return { autoApprove: true, byGrant: grant };
  }
  return { autoApprove: false };
}

/** Whether a request falls inside a grant class's bound. Pure, default-deny. */
function withinBound(cls: AuthorityClass, request: DelegatedRequest): boolean {
  if (cls.kind === "spend") {
    return typeof request.amountUsd === "number" && request.amountUsd >= 0 && request.amountUsd <= cls.maxUsd;
  }
  // writeScope: the request must be a write whose target is contained in the scope.
  if (typeof request.writePath !== "string" || request.writePath.length === 0) return false;
  return resolveInScope(request.writePath, cls.scope).ok;
}

/** Build the audit record for a delegated auto-approval. Pure. */
export function auditDelegatedDecision(
  grant: AuthorityGrant,
  action: string,
  now: Date = new Date(),
): DelegatedAuditRecord {
  return {
    delegator: grant.delegator,
    delegate: grant.delegate,
    action: action.trim(),
    grantId: grant.id,
    at: now.toISOString(),
  };
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
