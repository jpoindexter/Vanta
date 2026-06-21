// MCP `alwaysLoad` resolution (pure).
//
// An MCP server config may set `alwaysLoad: true`. Its tools are then ALWAYS
// exposed inline (full schemas), never deferred behind tool_search / the
// deferred-schema mechanism — so a frequently-used trusted server's tools are
// always directly callable. Absent / false → the tool is deferred as today.
//
// This module is PURE: it parses the always-load server set out of an MCP
// config object and resolves which tool names are exempt from deferral. It does
// NOT mount servers, touch the registry, or call the kernel. Wiring point named
// below.
//
// WIRING (not done this round — deliver pure parse + resolution + tests):
//   `agent/tool-scope.ts scopeToolSchemas` builds the `wanted` Set of exposed
//   schema names and returns `schemas.filter((s) => wanted.has(s.name))`. To make
//   always-load tools never defer, the always-load tool names would be unioned
//   into `wanted` BEFORE that filter (mirroring how `CORE` is force-included) —
//   i.e. `alwaysLoadToolNames(schemas.map((s) => s.name), servers).forEach((n) =>
//   wanted.add(n))`. The always-load server set comes from
//   `parseAlwaysLoadServers(await readMcpConfig(env, cwd))`. This affects SCHEMA
//   EXPOSURE only — the kernel still gates every call via `assess()`.

// Tool-naming assumption: a mounted MCP tool is named `mcp_<server>_<tool>` by
// `mount.ts toolName(server, tool)`, where BOTH server and tool are slugified
// (`[^a-zA-Z0-9_-]` → `_`). Because both halves may contain `_`, the split point
// is ambiguous in general — so we never split. Instead we match the literal
// prefix `mcp_<server>_` against the slugified name of each known always-load
// server. The server set is small and known, so prefix-matching is exact and
// avoids the ambiguity entirely.

const MCP_PREFIX = "mcp_";

/** Mirror of `mount.ts` slugification so prefix matching uses identical bytes. */
function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** A server entry may declare `alwaysLoad`. Read tolerantly (unknown shapes ignored). */
function isAlwaysLoadEntry(entry: unknown): boolean {
  return typeof entry === "object" && entry !== null && (entry as { alwaysLoad?: unknown }).alwaysLoad === true;
}

/** Collect always-load server names from a single `servers`/`mcpServers` map. */
function serversFromMap(map: unknown, into: Set<string>): void {
  if (typeof map !== "object" || map === null) return;
  for (const [name, entry] of Object.entries(map as Record<string, unknown>)) {
    if (isAlwaysLoadEntry(entry)) into.add(name);
  }
}

/**
 * Parse the set of server names whose config sets `alwaysLoad: true`. Tolerant:
 * reads both the `servers` (Vanta) and `mcpServers` (common convention) maps,
 * ignores non-object / garbage input, and returns [] when none qualify. Never
 * throws — absent / malformed config → no always-load servers (deferred as today).
 */
export function parseAlwaysLoadServers(config: unknown): string[] {
  if (typeof config !== "object" || config === null) return [];
  const found = new Set<string>();
  const cfg = config as { servers?: unknown; mcpServers?: unknown };
  serversFromMap(cfg.mcpServers, found);
  serversFromMap(cfg.servers, found);
  return [...found];
}

/**
 * Whether a tool name belongs to an always-load server (exempt from deferral).
 * True only for a tool named `mcp_<server>_...` whose `<server>` (slugified) is
 * in `alwaysLoadServers`. A deferred server's tool or a non-`mcp_` tool → false.
 */
export function isAlwaysLoadTool(toolName: string, alwaysLoadServers: readonly string[]): boolean {
  if (!toolName.startsWith(MCP_PREFIX)) return false;
  for (const server of alwaysLoadServers) {
    // `mcp_<server>_` — the trailing `_` guarantees a tool segment follows, so a
    // server named `foo` never matches a tool for a server named `foobar`.
    if (toolName.startsWith(`${MCP_PREFIX}${slug(server)}_`)) return true;
  }
  return false;
}

/**
 * The subset of `allToolNames` that are always-load (exempt from deferral). The
 * wiring point unions this into the exposed-schema set so these tools never
 * defer. Order/duplicates preserved from the input; absent always-load → [].
 */
export function alwaysLoadToolNames(
  allToolNames: readonly string[],
  alwaysLoadServers: readonly string[],
): string[] {
  if (alwaysLoadServers.length === 0) return [];
  return allToolNames.filter((name) => isAlwaysLoadTool(name, alwaysLoadServers));
}
