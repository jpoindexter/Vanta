import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveMemoryStore } from "../store/memory-store.js";
import { McpClient, stdioTransport, type McpToolDef, type Transport } from "./client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";

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
  const userRaw = (await resolveMemoryStore(env).read("mcp.json")) ?? "";

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

async function resolveTransport(
  name: string,
  spec: ServerSpec,
  env: NodeJS.ProcessEnv,
  children: Array<{ kill: () => void }>,
): Promise<Transport | null> {
  if (spec.url) {
    const { httpTransport, resolveToken } = await import("./http-transport.js");
    const token = resolveToken(name, spec.token, env);
    return httpTransport(spec.url, { token, headers: spec.headers });
  }
  if (spec.command) {
    const t = stdioTransport(spec.command, spec.args ?? [], { ...process.env, ...spec.env });
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
  log: (msg: string) => void;
}): Promise<number> {
  const { name, spec, registry, env, children, deferred, log } = opts;
  const transport = await resolveTransport(name, spec, env, children);
  if (!transport) { log(`  · mcp: ${name} skipped — no command or url`); return 0; }
  const client = new McpClient(transport);
  await client.initialize();
  const defs = await client.listTools();
  for (const def of defs) registry.register(mcpToolToVantaTool(client, name, def, { deferred }));
  log(`  · mcp: mounted ${name} (${defs.length} tool(s))${spec.url ? " [http]" : ""}`);
  return defs.length;
}

/**
 * Mount every configured MCP server into the registry. Best-effort per server.
 * Registers a process-exit handler to kill spawned children, and returns a
 * `dispose` for explicit cleanup. No config → no-op.
 */
export async function mountMcpServers(
  registry: ToolRegistry,
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = () => {},
): Promise<MountResult> {
  const config = await readMcpConfig(env);
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
      const count = await mountOneServer({ name, spec, registry, env, children, deferred, log });
      if (count > 0) { mounted.push(name); toolCount += count; }
    } catch (err) {
      log(`  · mcp: ${name} failed — ${(err as Error).message}`);
    }
  }

  const dispose = (): void => {
    for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  };
  process.once("exit", dispose);
  return { servers: mounted, toolCount, dispose };
}
