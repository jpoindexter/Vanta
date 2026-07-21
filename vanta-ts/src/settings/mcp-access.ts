import { z } from "zod";

// VANTA-SETTINGS-MCP — operator-controlled MCP server access policy.
// An `allow`/`deny` list of server names lets the operator decide which
// `.mcp.json` servers may mount this session. Standalone schema (no import from
// store.ts) so store.ts can fold it into SettingsSchema without a circular
// import. DENY ALWAYS WINS over allow (default-deny posture for a denied name);
// an allowlist (when present) RESTRICTS to only the listed servers. With neither
// list set the decision is "allow" for every server when an explicit mount is
// requested. Startup mounting is a separate opt-in (`autoMount`). Pure — no I/O,
// no spawn.
//
// This is an ADDED operator gate; the existing MCP trust dialog + the kernel
// `assess()` still gate every tool a mounted server exposes.

/** Operator-configurable MCP access block on settings.json. */
export const McpAccessSchema = z
  .object({
    /** Start enabled connectors with every Vanta session. Default false. */
    autoMount: z.boolean().optional(),
    /** When present, ONLY these server names may mount (allowlist restricts). */
    allow: z.array(z.string()).optional(),
    /** Server names that may never mount. Deny ALWAYS wins over allow. */
    deny: z.array(z.string()).optional(),
  })
  .strict();

export type McpAccess = z.infer<typeof McpAccessSchema>;

export type McpAccessDecision = "allow" | "deny";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

/** Configured MCP connectors stay dormant unless startup mounting is explicit. */
export function mcpAutoMountEnabled(
  access: McpAccess,
  env: NodeJS.ProcessEnv,
): boolean {
  const override = env.VANTA_MCP_AUTO_MOUNT;
  if (override !== undefined) return TRUTHY.has(override.trim().toLowerCase());
  return access.autoMount === true;
}

/** Normalize a server name for matching: trimmed (names are case-sensitive). */
function normalizeName(name: string): string {
  return name.trim();
}

/** Whether `name` matches any non-blank entry in `list`. Blank entries ignored. */
function listMatches(name: string, list: string[] | undefined): boolean {
  if (!list) return false;
  const target = normalizeName(name);
  if (target.length === 0) return false;
  return list.some((entry) => normalizeName(entry) === target);
}

/** Whether an allowlist is present and non-empty (has at least one real name). */
function hasAllowlist(access: McpAccess): boolean {
  return (access.allow ?? []).some((entry) => normalizeName(entry).length > 0);
}

/**
 * Resolve whether a single MCP server may mount.
 *   - A name on the `deny` list → "deny" (deny ALWAYS wins, even if also allowed).
 *   - An allowlist present + name NOT on it → "deny" (allowlist restricts).
 *   - Otherwise → "allow".
 * With neither list set this is "allow" for every name (today's behavior).
 * Pure — reads only the passed name + access policy.
 */
export function serverAccessDecision(
  serverName: string,
  access: McpAccess,
): McpAccessDecision {
  if (listMatches(serverName, access.deny)) return "deny";
  if (hasAllowlist(access) && !listMatches(serverName, access.allow)) return "deny";
  return "allow";
}

/**
 * Filter a list of configured MCP server names down to only those permitted to
 * mount under `access`. Preserves input order; deny-wins and allowlist-restrict
 * both apply via `serverAccessDecision`. Absent/empty policy → all names pass.
 * Pure.
 */
export function filterMountableServers(
  serverNames: string[],
  access: McpAccess,
): string[] {
  return serverNames.filter((name) => serverAccessDecision(name, access) === "allow");
}
