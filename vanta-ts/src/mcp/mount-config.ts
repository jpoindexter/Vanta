import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import type { McpClient, McpToolDef } from "./client.js";
import type { Tool } from "../tools/types.js";
import type { TrustConfirmer } from "../settings/trust-gate.js";
import type { McpAuthConfig } from "./auth-flow.js";

// Pure config-resolution + tool-mapping helpers for the MCP mount layer. No
// spawn, no live client lifecycle — that lives in mount.ts. Split out so both
// stay under the size gate; mount.ts re-exports the public surface unchanged.

/** First-time trust gate for MCP servers. Omitted → headless: untrusted servers are skipped. */
export type McpTrust = { root: string; confirm?: TrustConfirmer };

// Config sources (first wins for inline; files are merged with project winning on conflict):
//   1. VANTA_MCP_SERVERS env (JSON, inline)
//   2. ./.mcp.json in cwd — common mcpServers format (mcpServers key)
//   3. ~/.vanta/mcp.json — user-level fallback (servers key)
// Accepts both "mcpServers" (the common mcpServers convention) and "servers" (Vanta convention).

const ServerSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  // MCP remote: HTTP transport support
  url: z.string().url().optional(),
  token: z.string().optional(),
  headers: z.record(z.string()).optional(),
  // OAuth: when the server requires auth, these drive the `mcp_auth` flow.
  authorizationUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  scope: z.string().optional(),
  // EXT-MCP-CATALOG: a read-mostly default tool allowlist. When present, ONLY
  // these tool names are mounted from the server — mutating tools stay opt-in
  // (add them here explicitly). Absent → all of the server's tools mount.
  tools: z.array(z.string()).optional(),
}).refine((s) => s.command || s.url, "either command or url is required");

// Accept both "servers" (Vanta) and "mcpServers" (common convention) keys; merge with servers winning.
const ConfigSchema = z
  .object({
    servers: z.record(ServerSchema).optional(),
    mcpServers: z.record(ServerSchema).optional(),
  })
  .transform((d) => ({ servers: { ...(d.mcpServers ?? {}), ...(d.servers ?? {}) } }));

export type McpConfig = { servers: Record<string, z.infer<typeof ServerSchema>> };
export type ServerSpec = z.infer<typeof ServerSchema>;
export type McpConfigSource = "environment" | "project" | "user";
export type McpConfigResolution = {
  config: McpConfig;
  sources: Record<string, McpConfigSource>;
};

function parseOrEmpty(raw: string): McpConfig {
  try {
    return ConfigSchema.parse(JSON.parse(raw));
  } catch {
    return { servers: {} };
  }
}

/**
 * Read MCP server config. Checks VANTA_MCP_SERVERS first, then merges
 * ./.mcp.json (project-level, Claude-compat) with ~/.vanta/mcp.json (user-level).
 * Project-level wins on conflict.
 */
export async function readMcpConfig(env: NodeJS.ProcessEnv, cwd = process.cwd()): Promise<McpConfig> {
  return (await readMcpConfigWithSources(env, cwd)).config;
}

/** Resolve the merged config plus the winning scope for each server. */
export async function readMcpConfigWithSources(
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
): Promise<McpConfigResolution> {
  const inline = env.VANTA_MCP_SERVERS?.trim();
  if (inline) {
    const config = parseOrEmpty(inline);
    return {
      config,
      sources: Object.fromEntries(Object.keys(config.servers).map((name) => [name, "environment"])),
    };
  }

  const projectRaw = await readFile(join(cwd, ".mcp.json"), "utf8").catch(() => "");
  const userRaw = await readFile(join(resolveVantaHome(env), "mcp.json"), "utf8").catch(() => "");

  const project = projectRaw ? parseOrEmpty(projectRaw) : { servers: {} };
  const user = userRaw ? parseOrEmpty(userRaw) : { servers: {} };
  // user fills gaps; project wins on conflict
  const config = { servers: { ...user.servers, ...project.servers } };
  const sources: Record<string, McpConfigSource> = {};
  for (const name of Object.keys(user.servers)) sources[name] = "user";
  for (const name of Object.keys(project.servers)) sources[name] = "project";
  return { config, sources };
}

/** Slugify a server+tool pair into an OpenAI-safe tool name (`[a-zA-Z0-9_-]`). */
function toolName(server: string, tool: string): string {
  return `mcp_${server}_${tool}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Build an Vanta Tool that proxies to an MCP server tool. */
export function mcpToolToVantaTool(
  client: Pick<McpClient, "callTool">,
  server: string,
  def: McpToolDef,
  opts: { deferred?: boolean } = {},
): Tool {
  // Deferred tools: when deferred=true, strip the parameters from the schema.
  // The tool still works but the LLM must call tool_search to get the full schema.
  const parameters = opts.deferred
    ? { type: "object" as const, properties: {}, description: "Use tool_search to fetch the full schema before calling." }
    : (def.inputSchema ?? { type: "object", properties: {} });
  return {
    schema: {
      name: toolName(server, def.name),
      description: (def.description ?? `MCP tool ${def.name} from ${server}`) +
        (opts.deferred ? " [schema deferred — call tool_search to expand]" : ""),
      parameters,
    },
    // Surface server/tool/args so the kernel can assess (an MCP fs-write is gated
    // like any other). Truncated to keep content keywords from false-triggering.
    describeForSafety: (args) => `mcp ${server} ${def.name} ${JSON.stringify(args).slice(0, 200)}`,
    async execute(args) {
      try {
        const output = await client.callTool(def.name, args as Record<string, unknown>);
        return { ok: true, output: output || "(empty result)" };
      } catch (err) {
        return { ok: false, output: `mcp ${server}.${def.name} failed: ${(err as Error).message}` };
      }
    },
  };
}

/** Pull a complete OAuth config off a spec, or null when one isn't configured. */
export function extractAuthConfig(spec: ServerSpec): McpAuthConfig | null {
  if (!spec.authorizationUrl || !spec.tokenUrl || !spec.clientId) return null;
  return {
    authorizationUrl: spec.authorizationUrl,
    tokenUrl: spec.tokenUrl,
    clientId: spec.clientId,
    clientSecret: spec.clientSecret,
    scope: spec.scope,
  };
}

// Non-secret env vars a stdio MCP child legitimately needs (PATH so it can find
// its interpreter, locale, terminal, tmp/home). Deliberately excludes every
// credential the operator holds (OPENAI_API_KEY, tokens, etc.). win32 adds the
// vars Windows binaries require to run at all.
const SAFE_ENV_KEYS = [
  "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "TMPDIR", "TZ", "SHELL",
] as const;
const WIN32_ENV_KEYS = ["SystemRoot", "PATHEXT"] as const;

/**
 * Build a scoped child env for a stdio MCP server: a small allowlist of
 * non-secret vars from the parent, MERGED with the server's own declared `env`
 * (declared env wins). The full operator environment — API keys, tokens — is
 * NOT inherited. `VANTA_MCP_FULL_ENV=1` opts back into the full parent spread
 * for a server that genuinely needs inherited env. Pure: testable.
 */
export function buildMcpChildEnv(
  processEnv: NodeJS.ProcessEnv,
  specEnv?: Record<string, string>,
): NodeJS.ProcessEnv {
  if (processEnv.VANTA_MCP_FULL_ENV === "1") return { ...processEnv, ...specEnv };
  const allow = process.platform === "win32" ? [...SAFE_ENV_KEYS, ...WIN32_ENV_KEYS] : SAFE_ENV_KEYS;
  const out: NodeJS.ProcessEnv = {};
  for (const key of allow) {
    const val = processEnv[key];
    if (val !== undefined) out[key] = val;
  }
  return { ...out, ...specEnv };
}
