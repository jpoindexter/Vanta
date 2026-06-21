// VANTA-MCP-PROJECT-APPROVE — per-project, PER-SERVER approval for `.mcp.json` servers.
//
// A `.mcp.json` declares MCP servers; adding one must NOT silently mount it.
// Each server gets a per-project, per-server approval decision bound to its
// COMMAND (command + args), so a server whose launch command CHANGES after a
// prior approval re-asks (anti-bait-and-switch). Approve once → remembered for
// that project+server; a new or changed server is flagged before mount.
//
// RECONCILIATION with the existing trust model: `settings/trust.ts` /
// `trust-gate.ts` (`resolveMcpTrust`, `.vanta/trust.json` `mcp?: Record<name,
// boolean>`) is already per-project and per-server BY NAME — but it keys only on
// the server name, so a server whose command silently changes after approval is
// still recalled as trusted. This module is the COMMAND-BOUND delta: it binds an
// approval to a stable hash of the server's command+args, so a changed command
// invalidates the prior approval and re-asks. It composes with the official
// registry SIGNAL (`official-registry.ts`) — the registry says "known/official",
// this says "approved here, with THIS command".
//
// SECURITY: approval is a per-server SIGNAL the operator confirms — it does NOT
// replace the kernel `assess()` gate. Every tool a mounted server exposes still
// goes through `assess()` on every call. Approval only decides whether the
// server is allowed to MOUNT at all; the kernel remains the enforced boundary.
//
// PURE + injectable: every function takes plain data (records array, server
// spec) and returns plain data. No filesystem, no network, no crypto dep — a
// deterministic djb2 hash over the canonical command JSON. The caller owns
// persistence (it would live alongside `.vanta/trust.json`).

/** The command-relevant shape of a `.mcp.json` server: what a hash binds to. */
export type ApprovableServer = {
  /** Stdio launch command, when the server is a stdio server. */
  command?: string;
  /** Stdio launch arguments, when present. */
  args?: string[];
  /** Remote URL, when the server is an HTTP/remote MCP server. */
  url?: string;
};

/** One per-project approval decision, bound to a server name + its command hash. */
export type ServerApprovalRecord = {
  /** Server name as it appears as the `.mcp.json` key. */
  serverName: string;
  /** Stable hash of the server's command + args (+ url). A changed command → a new hash. */
  commandHash: string;
  /** Whether the operator approved this server with THIS command. */
  approved: boolean;
};

/** Approval status for a declared server given the stored records. */
export type ServerApprovalStatus = "approved" | "needs-approval" | "changed";

/**
 * Deterministically hash a server's launch command so an approval can be bound
 * to it. Hashes the canonical JSON of `{command, args, url}` (args order is
 * significant — it's part of the command) with djb2, returned as an unsigned
 * base-36 string. Stable + deterministic: the same spec always yields the same
 * hash; a changed command/args/url yields a different one. No crypto dep needed
 * — this is a change-detection fingerprint, not a security primitive.
 */
export function serverCommandHash(server: ApprovableServer): string {
  const canonical = JSON.stringify({
    command: server.command ?? null,
    args: server.args ?? null,
    url: server.url ?? null,
  });
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    // djb2: hash * 33 + c, kept in 32-bit unsigned range.
    hash = (hash * 33 + canonical.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Find the stored record for a server name, or undefined. Pure. */
function findRecord(
  records: readonly ServerApprovalRecord[],
  serverName: string,
): ServerApprovalRecord | undefined {
  return records.find((r) => r.serverName === serverName);
}

/**
 * Resolve a declared server's approval status against the stored records.
 *   - "approved":       a record matches name AND commandHash AND approved.
 *   - "changed":        a record matches name but the command hash DIFFERS
 *                       (the command changed → re-ask; a prior approval/denial
 *                       for the OLD command must not carry over).
 *   - "needs-approval": no record for this name, OR a record exists for the
 *                       current command but is NOT approved (a prior deny).
 * Pure.
 */
export function serverApprovalStatus(
  serverName: string,
  server: ApprovableServer,
  records: readonly ServerApprovalRecord[],
): ServerApprovalStatus {
  const record = findRecord(records, serverName);
  if (!record) return "needs-approval";
  if (record.commandHash !== serverCommandHash(server)) return "changed";
  return record.approved ? "approved" : "needs-approval";
}

/**
 * Upsert an approval decision for a server, returning the NEXT records array
 * (immutable — the input is never mutated). Records are keyed by server name:
 * an existing record for the name is replaced with one carrying the CURRENT
 * command hash and the new `approved` flag, so a re-approval after a command
 * change updates the bound hash. Pure.
 */
export function recordServerApproval(
  records: readonly ServerApprovalRecord[],
  serverName: string,
  server: ApprovableServer,
  approved: boolean,
): ServerApprovalRecord[] {
  const next: ServerApprovalRecord = {
    serverName,
    commandHash: serverCommandHash(server),
    approved,
  };
  const others = records.filter((r) => r.serverName !== serverName);
  return [...others, next];
}

/**
 * Given the declared servers and the stored records, return the names of every
 * server that must be confirmed before mount: status "needs-approval" OR
 * "changed". An "approved" server is omitted. This is the INVARIANT enforcer —
 * an unapproved or changed server is always in this list, so the mount path can
 * never silently mount one. Pure.
 */
export function serversNeedingApproval(
  servers: Readonly<Record<string, ApprovableServer>>,
  records: readonly ServerApprovalRecord[],
): string[] {
  const needing: string[] = [];
  for (const [name, server] of Object.entries(servers)) {
    if (serverApprovalStatus(name, server, records) !== "approved") {
      needing.push(name);
    }
  }
  return needing;
}
