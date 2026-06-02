import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveArgoHome } from "../store/home.js";
import { McpClient, stdioTransport, type McpToolDef } from "./client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";

// Mount external MCP servers as Argo tools. Config from ARGO_MCP_SERVERS (JSON)
// or ~/.argo/mcp.json: { "servers": { "<name>": { "command", "args"?, "env"? } } }.
// No config → no-op (zero overhead). Each server is best-effort: one that fails
// to start doesn't block the others or the session. MCP tools go through the
// kernel `assess()` like every other tool.

const ServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});
const ConfigSchema = z.object({ servers: z.record(ServerSchema).default({}) });

export type McpConfig = z.infer<typeof ConfigSchema>;

/** Read MCP server config from env or ~/.argo/mcp.json. Empty when absent/invalid. */
export async function readMcpConfig(env: NodeJS.ProcessEnv): Promise<McpConfig> {
  const inline = env.ARGO_MCP_SERVERS?.trim();
  const raw = inline ?? (await readFile(join(resolveArgoHome(env), "mcp.json"), "utf8").catch(() => ""));
  if (!raw) return { servers: {} };
  try {
    return ConfigSchema.parse(JSON.parse(raw));
  } catch {
    return { servers: {} };
  }
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
