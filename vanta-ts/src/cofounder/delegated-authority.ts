import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { resolveInScope } from "../scope.js";
import type { Risk } from "../types.js";

// COFOUNDER-DELEGATED-AUTHORITY — an owner grants a manager bounded authority
// over an approval CLASS (spend <= $X, or file writes inside scope Y). An
// Ask-class action that falls within an active grant's bound is auto-approved
// by the manager up to the bound, and the decision (delegator, delegate, action)
// is appended to a tamper-evident-by-append audit log.
//
// HARD INVARIANTS (the security floor, never delegated):
//   - A Block-floor request is NEVER auto-approved — only Ask-class delegates.
//   - Default-deny: anything not provably inside an active grant's bound → no.
//   - The kernel block floor is enforced upstream; this layer only ever decides
//     whether an Ask becomes an auto-approve. It cannot upgrade a Block.
//
// PURE: the grant model, bound-check, and audit-record builders take no I/O.
// The store + audit log are separate, injected-fs functions.

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

// ---- Store (~/.vanta/authority-grants.json + append-only audit log, injected fs) ----

export type AuthorityFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  appendFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: AuthorityFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  appendFile: (p, d) => appendFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  grants: z.array(z.unknown()).default([]),
});

export function grantsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "authority-grants.json");
}

export function auditLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "authority-audit.jsonl");
}

/**
 * Read all grants. Tolerant: a missing file → []; a corrupt file or malformed
 * entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readGrants(
  env: NodeJS.ProcessEnv = process.env,
  fs: AuthorityFs = realFs,
): Promise<AuthorityGrant[]> {
  let raw: string;
  try {
    raw = await fs.readFile(grantsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: AuthorityGrant[] = [];
  for (const row of parsed.grants) {
    const ok = AuthorityGrantSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full grant list, latest-wins. */
export async function writeGrants(
  list: AuthorityGrant[],
  env: NodeJS.ProcessEnv = process.env,
  fs: AuthorityFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(grantsPath(env), `${JSON.stringify({ version: 1, grants: list }, null, 2)}\n`);
}

/** Append one decision to the append-only audit log (one JSON object per line). */
export async function appendAuditRecord(
  record: DelegatedAuditRecord,
  env: NodeJS.ProcessEnv = process.env,
  fs: AuthorityFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.appendFile(auditLogPath(env), `${JSON.stringify(record)}\n`);
}

/** Read the audit log, tolerant of malformed lines (dropped). */
export async function readAuditLog(
  env: NodeJS.ProcessEnv = process.env,
  fs: AuthorityFs = realFs,
): Promise<DelegatedAuditRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(auditLogPath(env));
  } catch {
    return [];
  }
  const out: DelegatedAuditRecord[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as DelegatedAuditRecord);
    } catch {
      // drop a malformed line, keep the rest
    }
  }
  return out;
}
