import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveArgoHome } from "../store/home.js";
import { McpClient, stdioTransport, type McpToolDef } from "./client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";

// Mount external MCP servers as Argo tools.
// Config sources (first wins for inline; files are merged with project winning on conflict):
//   1. VANTA_MCP_SERVERS env (JSON, inline)
//   2. ./.mcp.json in cwd — Claude-compatible format (mcpServers key)
//   3. ~/.argo/mcp.json — user-level fallback (servers key)
// Accepts both "mcpServers" (Claude Code convention) and "servers" (Argo convention).
// No config → no-op (zero overhead). Each server is best-effort: one that fails
// to start doesn't block the others or the session. MCP tools go through the
// kernel `assess()` like every other tool.

const ServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

// Accept both "servers" (Argo) and "mcpServers" (Claude Code) keys; merge with servers winning.
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
 * ./.mcp.json (project-level, Claude-compat) with ~/.argo/mcp.json (user-level).
 * Project-level wins on conflict.
 */
export async function readMcpConfig(env: NodeJS.ProcessEnv, cwd = process.cwd()): Promise<McpConfig> {
  const inline = env.VANTA_MCP_SERVERS?.trim();
  if (inline) return parseOrEmpty(inline);

  const projectRaw = await readFile(join(cwd, ".mcp.json"), "utf8").catch(() => "");
  const userRaw = await readFile(join(resolveArgoHome(env), "mcp.json"), "utf8").catch(() => "");

  const project = projectRaw ? parseOrEmpty(projectRaw) : { servers: {} };
  const user = userRaw ? parseOrEmpty(userRaw) : { servers: {} };
  // user fills gaps; project wins on conflict
  return { servers: { ...user.servers, ...project.servers } };
}

/** Slugify a server+tool pair into an OpenAI-safe tool name (`[a-zA-Z0-9_-]`). */
function toolName(server: string, tool: string): string {
  return `mcp_${server}_${tool}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Build an Argo Tool that proxies to an MCP server tool. */
export function mcpToolToArgoTool(
  client: Pick<McpClient, "callTool">,
  server: string,
  def: McpToolDef,
): Tool {
  return {
    schema: {
      name: toolName(server, def.name),
      description: def.description ?? `MCP tool ${def.name} from ${server}`,
      parameters: def.inputSchema ?? { type: "object", properties: {} },
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

  for (const name of names) {
    const spec = config.servers[name];
    if (!spec) continue;
    try {
      const { transport, child } = stdioTransport(spec.command, spec.args ?? [], {
        ...process.env,
        ...spec.env,
      });
      children.push({ kill: () => child.kill() });
      const client = new McpClient(transport);
      await client.initialize();
      const defs = await client.listTools();
      for (const def of defs) {
        registry.register(mcpToolToArgoTool(client, name, def));
        toolCount++;
      }
      mounted.push(name);
      log(`  · mcp: mounted ${name} (${defs.length} tool(s))`);
    } catch (err) {
      log(`  · mcp: ${name} failed — ${(err as Error).message}`);
    }
  }

  const dispose = (): void => {
    for (const c of children) {
      try {
        c.kill();
      } catch {
        /* already gone */
      }
    }
  };
  process.once("exit", dispose);
  return { servers: mounted, toolCount, dispose };
}
