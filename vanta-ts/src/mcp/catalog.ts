import type { ServerSpec } from "./mount-config.js";

// EXT-MCP-CATALOG — a small VETTED catalog of MCP servers + `vanta mcp install
// <name>`, so mounting isn't raw-config surgery. Each entry declares its
// transport, the auth env it needs, and a READ-MOSTLY default tool subset:
// install writes only those tools to the server's allowlist, so mutating tools
// are opt-in per threat model (the mount layer honors `spec.tools`; the kernel
// still gates every call). Pure data + a pure install-config builder.

export type McpCatalogEntry = {
  name: string;
  description: string;
  /** stdio transport: the launch command + args (npx-based servers). */
  command?: string;
  args?: string[];
  /** HTTP transport: the server URL (mutually exclusive with command). */
  url?: string;
  /** Env vars the server needs (the user supplies the values). */
  authEnv?: string[];
  /** A single bearer-token env var for a remote server. */
  tokenEnv?: string;
  /** The read-mostly tool subset installed by default (mutating tools omitted). */
  defaultTools: string[];
  /** Mutating/dangerous tools the entry documents as opt-in (not installed by default). */
  optInTools?: string[];
  docsUrl?: string;
};

// Curated, conservative. Every entry's defaultTools is read-mostly; write/delete
// tools live in optInTools and require an explicit `--with-tool`.
export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    name: "filesystem",
    description: "Local filesystem access (official reference server).",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    defaultTools: ["read_file", "read_multiple_files", "list_directory", "directory_tree", "search_files", "get_file_info"],
    optInTools: ["write_file", "edit_file", "create_directory", "move_file"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  },
  {
    name: "github",
    description: "GitHub repos, issues, and PRs (official server).",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    authEnv: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    defaultTools: ["search_repositories", "get_file_contents", "list_issues", "get_issue", "list_pull_requests", "search_code"],
    optInTools: ["create_issue", "create_pull_request", "create_or_update_file", "merge_pull_request", "push_files"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
  },
  {
    name: "fetch",
    description: "Fetch a URL and return it as markdown (official server).",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    defaultTools: ["fetch"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    name: "homeassistant",
    description: "Home Assistant via its built-in MCP server and local mcp-proxy.",
    command: "mcp-proxy",
    args: ["--transport=streamablehttp", "--stateless", "http://homeassistant.local:8123/api/mcp"],
    authEnv: ["API_ACCESS_TOKEN"],
    defaultTools: ["GetLiveContext"],
    optInTools: ["GetDateTime", "HassTurnOn", "HassTurnOff", "HassLightSet", "HassClimateSetTemperature", "HassCancelAllTimers"],
    docsUrl: "https://www.home-assistant.io/integrations/mcp_server/",
  },
  {
    name: "box-remote-mcp",
    description: "Box's hosted MCP server for authorized file and folder work.",
    url: "https://mcp.box.com",
    authEnv: ["VANTA_BOX_MCP_TOKEN"],
    tokenEnv: "VANTA_BOX_MCP_TOKEN",
    defaultTools: [],
    docsUrl: "https://developer.box.com/guides/box-mcp/setup",
  },
  {
    name: "atlassian-rovo-mcp",
    description: "Atlassian Rovo's hosted MCP server for Jira, Confluence, and Bitbucket.",
    url: "https://mcp.atlassian.com/v1/mcp/authv2",
    authEnv: ["VANTA_ATLASSIAN_ROVO_MCP_TOKEN"],
    tokenEnv: "VANTA_ATLASSIAN_ROVO_MCP_TOKEN",
    defaultTools: [],
    docsUrl: "https://developer.atlassian.com/cloud/rovo-mcp/guides/getting-started/",
  },
];

export function catalogEntry(name: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.name === name);
}

export type InstallResult = { ok: true; spec: ServerSpec; toolCount: number } | { ok: false; error: string };

/**
 * Build the `.mcp.json` server spec for a catalog entry. The `tools` allowlist
 * is the read-mostly default PLUS any explicitly-requested opt-in tools (each
 * validated against the entry's declared optInTools — an unknown tool is
 * rejected, never silently mounted). Pure.
 */
export function buildInstallSpec(entry: McpCatalogEntry, withTools: readonly string[] = []): InstallResult {
  const optIn = new Set(entry.optInTools ?? []);
  for (const t of withTools) {
    if (!optIn.has(t)) {
      return { ok: false, error: `"${t}" is not an opt-in tool of "${entry.name}" (available: ${[...optIn].join(", ") || "none"})` };
    }
  }
  const tools = [...entry.defaultTools, ...withTools];
  const env = entry.authEnv?.length ? { env: Object.fromEntries(entry.authEnv.map((key) => [key, `\${${key}}`])) } : {};
  const token = entry.tokenEnv ? { token: `\${${entry.tokenEnv}}` } : {};
  const spec: ServerSpec = entry.url
    ? { url: entry.url, tools, ...env, ...token }
    : { command: entry.command, args: entry.args, tools, ...env };
  return { ok: true, spec, toolCount: tools.length };
}

/** Merge an installed server into an existing config (name wins on re-install). Pure. */
export function installIntoConfig(
  config: { servers: Record<string, ServerSpec> },
  name: string,
  spec: ServerSpec,
): { servers: Record<string, ServerSpec> } {
  return { servers: { ...config.servers, [name]: spec } };
}
