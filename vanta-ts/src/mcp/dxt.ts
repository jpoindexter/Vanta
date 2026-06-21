import { join } from "node:path";
import { z } from "zod";

// VANTA-DXT — parse a `.dxt` extension package (Anthropic's desktop-extension
// format: a zip bundling an MCP server + a `manifest.json` declaring its
// name/command/config) into an MCP server config + an install PLAN, so an
// operator can install an MCP server from one file.
//
// This module is PURE + injectable: the manifest parse and the install-plan
// build (validate → resolve the run command → the `.mcp.json` entry) take plain
// data and an injected `extensionsDir`, so they unit-test with no real unzip and
// no filesystem. Errors-as-values throughout: a malformed `.dxt` → `{error}`,
// never a thrown exception, and NO install proceeds.
//
// The actual unzip + write are the DOCUMENTED BOUNDARY (injected, not done
// here): a `vanta mcp install <file.dxt>` command / a setup step would (1) unzip
// the package into `plan.installDir`, then (2) write `plan.mcpEntry` under
// `plan.serverName` into `.mcp.json` (the same shape `readMcpConfig` reads).
//
// SECURITY: the package name is sanitized to a safe single dir segment before it
// becomes an install dir (no `..`/`/` traversal); a hostile name is rejected.
// Installing an MCP server is NOT trusting it: the installed server STILL goes
// through the trust dialog (`resolveMcpTrust`) and the kernel `assess()` gate
// when it mounts — install ≠ trust.

/** A parsed `.dxt` manifest: the MCP server an extension package declares. */
export type DxtManifest = {
  name: string;
  version?: string;
  server: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
};

/** The `.mcp.json` server entry an installed extension becomes (mount.ts shape). */
export type McpServerEntry = {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
};

/** The install plan: where to extract, the entry to add, a human step list. */
export type DxtInstallPlan = {
  installDir: string;
  serverName: string;
  mcpEntry: McpServerEntry;
  steps: string[];
};

/** Errors-as-values result wrapper — a malformed input yields `{error}`. */
export type DxtResult<T> = T | { error: string };

/** Type guard: did a `DxtResult` resolve to an error rather than a value? */
export function isDxtError<T>(r: DxtResult<T>): r is { error: string } {
  return typeof r === "object" && r !== null && "error" in r;
}

// The server block: a launch command is required (stdio MCP server); args/env
// are optional. Mirrors mount.ts's ServerSchema validation style.
const ServerSchema = z.object({
  command: z.string().min(1, "server.command must be a non-empty string"),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

// The manifest: name + server are required; version is optional provenance.
// Unknown fields are stripped (a real `.dxt` manifest carries extra metadata).
const ManifestSchema = z.object({
  name: z.string().min(1, "name must be a non-empty string"),
  version: z.string().optional(),
  server: ServerSchema,
});

/**
 * Parse a `.dxt` `manifest.json` string into a {@link DxtManifest}. Errors-as-
 * values: invalid JSON, a non-object, or a missing/empty `server.command` all
 * return `{error}` — never throw, never a partial install. The manifest is
 * UNTRUSTED package input, so it's zod-validated at the boundary.
 */
export function parseDxtManifest(json: string): DxtResult<DxtManifest> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    return { error: `invalid manifest JSON: ${(err as Error).message}` };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "manifest must be a JSON object" };
  }
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: `invalid manifest: ${parsed.error.issues[0]?.message ?? "unknown error"}` };
  }
  const { name, version, server } = parsed.data;
  return {
    name,
    ...(version ? { version } : {}),
    server: {
      command: server.command,
      ...(server.args ? { args: server.args } : {}),
      ...(server.env ? { env: server.env } : {}),
    },
  };
}

/**
 * Reduce an arbitrary package name to a safe single directory segment — strips
 * path separators and traversal so an extract can never escape the extensions
 * dir. Lower-cased, non-`[a-z0-9-_]` collapsed to `-`. Empty after sanitizing
 * (e.g. a name that was only `../`) → `""`, which {@link buildDxtInstallPlan}
 * rejects. Mirrors `slugifySkillName` in store/home.ts.
 */
export function sanitizeDxtName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Build the `.mcp.json` server entry an installed extension becomes. The run
 * command is the manifest's declared command/args; `cwd` is the install dir so
 * the spawned server resolves its bundled files relative to where it unzipped.
 * Pure — the mount.ts `ServerSchema` accepts this shape verbatim.
 */
export function dxtToMcpServerEntry(manifest: DxtManifest, installDir: string): McpServerEntry {
  return {
    command: manifest.server.command,
    args: manifest.server.args ?? [],
    env: manifest.server.env ?? {},
    cwd: installDir,
  };
}

/** Injected dependencies for {@link buildDxtInstallPlan}. */
export type DxtPlanDeps = {
  /** The dir under which extensions install (e.g. `~/.vanta/extensions`). */
  extensionsDir: string;
};

/**
 * Build the install PLAN for a parsed manifest: the install dir under
 * `extensionsDir/<sanitized name>`, the `.mcp.json` entry to add, and a human
 * step list. Errors-as-values: a name that sanitizes to empty (pure traversal /
 * all-stripped) yields `{error}` and NO plan — the hostile name is rejected, not
 * silently coerced. Pure given the injected `extensionsDir`; the unzip + write
 * the steps describe are the documented boundary (done by the caller, not here).
 */
export function buildDxtInstallPlan(
  manifest: DxtManifest,
  deps: DxtPlanDeps,
): DxtResult<DxtInstallPlan> {
  const serverName = sanitizeDxtName(manifest.name);
  if (!serverName) {
    return { error: `unsafe extension name "${manifest.name}" — no valid directory segment after sanitizing` };
  }
  const installDir = join(deps.extensionsDir, serverName);
  const mcpEntry = dxtToMcpServerEntry(manifest, installDir);
  const steps = [
    `Unzip the .dxt package into ${installDir}`,
    `Add the "${serverName}" server entry to .mcp.json (command "${mcpEntry.command}", cwd ${installDir})`,
    `On next mount, "${serverName}" goes through the trust dialog + kernel assess() gate (install ≠ trust)`,
  ];
  return { installDir, serverName, mcpEntry, steps };
}
