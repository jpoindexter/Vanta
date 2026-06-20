import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { McpClient, stdioTransport, type McpToolDef, type Transport } from "./client.js";
import { mcpClientEvents } from "./events.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";
import { resolveMcpTrust, type TrustConfirmer } from "../settings/trust-gate.js";
import { isAuthRequiredError } from "./auth-detect.js";
import { authPending, type AuthPendingRegistry } from "./auth-pending.js";
import type { McpAuthConfig } from "./auth-flow.js";
import { loadMcpToken } from "./auth-store.js";

/** First-time trust gate for MCP servers. Omitted → headless: untrusted servers are skipped. */
export type McpTrust = { root: string; confirm?: TrustConfirmer };

// Mount external MCP servers as Vanta tools.
// Config sources (first wins for inline; files are merged with project winning on conflict):
//   1. VANTA_MCP_SERVERS env (JSON, inline)
//   2. ./.mcp.json in cwd — common mcpServers format (mcpServers key)
//   3. ~/.vanta/mcp.json — user-level fallback (servers key)
// Accepts both "mcpServers" (the common mcpServers convention) and "servers" (Vanta convention).
// No config → no-op (zero overhead). Each server is best-effort: one that fails
// to start doesn't block the others or the session. MCP tools go through the
// kernel `assess()` like every other tool.

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
}).refine((s) => s.command || s.url, "either command or url is required");

// Accept both "servers" (Vanta) and "mcpServers" (common convention) keys; merge with servers winning.
const ConfigSchema = z
  .object({
    servers: z.record(ServerSchema).optional(),
    mcpServers: z.record(ServerSchema).optional(),
  })
  .transform((d) => ({ servers: { ...(d.mcpServers ?? {}), ...(d.servers ?? {}) } }));

export type McpConfig = { servers: Record<string, z.infer<typeof ServerSchema>> };

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
  const inline = env.VANTA_MCP_SERVERS?.trim();
  if (inline) return parseOrEmpty(inline);

  const projectRaw = await readFile(join(cwd, ".mcp.json"), "utf8").catch(() => "");
  const userRaw = await readFile(join(resolveVantaHome(env), "mcp.json"), "utf8").catch(() => "");

  const project = projectRaw ? parseOrEmpty(projectRaw) : { servers: {} };
  const user = userRaw ? parseOrEmpty(userRaw) : { servers: {} };
  // user fills gaps; project wins on conflict
  return { servers: { ...user.servers, ...project.servers } };
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

export type MountResult = { servers: string[]; toolCount: number; dispose: () => void };

type ServerSpec = z.infer<typeof ServerSchema>;

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

async function resolveTransport(
  name: string,
  spec: ServerSpec,
  env: NodeJS.ProcessEnv,
  children: Array<{ kill: () => void }>,
): Promise<Transport | null> {
  if (spec.url) {
    const { httpTransport, resolveToken } = await import("./http-transport.js");
    // A previously-stored OAuth access token wins over a static config token.
    const stored = await loadMcpToken(name, env);
    const token = stored?.access_token ?? resolveToken(name, spec.token, env);
    return httpTransport(spec.url, { token, headers: spec.headers });
  }
  if (spec.command) {
    const t = stdioTransport(spec.command, spec.args ?? [], buildMcpChildEnv(env, spec.env));
    children.push({ kill: () => t.child.kill() });
    return t.transport;
  }
  return null;
}

async function mountOneServer(opts: {
  name: string;
  spec: ServerSpec;
  registry: ToolRegistry;
  env: NodeJS.ProcessEnv;
  children: Array<{ kill: () => void }>;
  deferred: boolean;
  cwd: string;
  log: (msg: string) => void;
  trust?: McpTrust;
}): Promise<number> {
  const { name, spec, registry, env, children, deferred, cwd, log, trust } = opts;
  const transport = await resolveTransport(name, spec, env, children);
  if (!transport) { log(`  · mcp: ${name} skipped — no command or url`); return 0; }
  const client = new McpClient(transport, mcpClientEvents(cwd, name));
  await client.initialize();
  const defs = await client.listTools();
  if (trust) {
    const tools = defs.map((d) => ({ name: d.name, description: d.description }));
    const ok = await resolveMcpTrust(trust.root, name, tools, trust.confirm);
    if (!ok) { log(`  · mcp: ${name} skipped — not trusted`); return 0; }
  }
  for (const def of defs) registry.register(mcpToolToVantaTool(client, name, def, { deferred }));
  log(`  · mcp: mounted ${name} (${defs.length} tool(s))${spec.url ? " [http]" : ""}`);
  return defs.length;
}

/**
 * Handle a per-server mount failure. When the error signals OAuth is required
 * AND the spec carries an auth config, mark the server auth-pending (its real
 * tools stay unregistered; the agent gets `mcp_auth` instead). Otherwise it's a
 * plain best-effort failure. The error message is logged; tokens never are.
 */
function handleMountFailure(opts: {
  name: string;
  spec: ServerSpec;
  err: unknown;
  pending: AuthPendingRegistry;
  log: (msg: string) => void;
}): void {
  const { name, spec, err, pending, log } = opts;
  const auth = extractAuthConfig(spec);
  if (auth && isAuthRequiredError(err)) {
    pending.mark(name, auth);
    log(`  · mcp: ${name} needs auth — run mcp_auth("${name}") to authorize`);
    return;
  }
  log(`  · mcp: ${name} failed — ${(err as Error).message}`);
}

/**
 * Mount every configured MCP server into the registry. Best-effort per server.
 * Registers a process-exit handler to kill spawned children, and returns a
 * `dispose` for explicit cleanup. No config → no-op. Auth-required servers are
 * recorded in the pending registry so `mcp_auth` can authorize + reconnect them.
 */
export async function mountMcpServers(
  registry: ToolRegistry,
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = () => {},
  opts: { cwd?: string; trust?: McpTrust; pending?: AuthPendingRegistry } = {},
): Promise<MountResult> {
  const cwd = opts.cwd ?? process.cwd();
  const trust = opts.trust;
  const pending = opts.pending ?? authPending;
  const config = await readMcpConfig(env, cwd);
  const names = Object.keys(config.servers);
  if (names.length === 0) return { servers: [], toolCount: 0, dispose: () => {} };

  const children: Array<{ kill: () => void }> = [];
  const mounted: string[] = [];
  let toolCount = 0;
  const deferred = env.VANTA_MCP_DEFER === "1";

  for (const name of names) {
    const spec = config.servers[name];
    if (!spec) continue;
    try {
      const count = await mountOneServer({ name, spec, registry, env, children, deferred, cwd, log, trust });
      if (count > 0) { mounted.push(name); toolCount += count; }
    } catch (err) {
      handleMountFailure({ name, spec, err, pending, log });
    }
  }

  const dispose = (): void => {
    for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  };
  process.once("exit", dispose);
  return { servers: mounted, toolCount, dispose };
}
