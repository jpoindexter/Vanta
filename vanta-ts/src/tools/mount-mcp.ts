import { z } from "zod";
import { stdioTransport, McpClient } from "../mcp/client.js";
import { mcpToolToVantaTool } from "../mcp/mount.js";
import type { Tool, ToolResult } from "./types.js";
import type { ToolRegistry } from "./registry.js";

const Args = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const MOUNT_MCP_SCHEMA: Tool["schema"] = {
  name: "mount_mcp",
  description:
    "Spawn an MCP server process and mount its tools into the active registry. " +
    "Use to hook in an existing MCP server or one you just scaffolded. " +
    "Returns the list of tool names registered.",
  parameters: {
    type: "object",
    required: ["name", "command"],
    properties: {
      name: {
        type: "string",
        description: "Unique name for this server (used as tool name prefix mcp_<name>_<tool>)",
      },
      command: { type: "string", description: "Command to spawn the server (e.g. npx, node)" },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Arguments to pass to the command",
      },
      env: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Optional env vars for the server process",
      },
    },
  },
};

/** Spawn the MCP server, initialize it, and register its tools into the live registry. */
async function executeMountMcp(registry: ToolRegistry, rawArgs: unknown): Promise<ToolResult> {
  const r = Args.safeParse(rawArgs);
  if (!r.success) return { ok: false, output: `invalid args: ${r.error.message}` };
  const { name, command, args: cmdArgs = [], env: cmdEnv = {} } = r.data;

  try {
    const { transport, child } = stdioTransport(command, cmdArgs, {
      ...process.env,
      ...cmdEnv,
    });
    process.once("exit", () => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    });

    const client = new McpClient(transport);
    await client.initialize();
    const defs = await client.listTools();
    const names: string[] = [];
    for (const def of defs) {
      const tool = mcpToolToVantaTool(client, name, def);
      registry.register(tool);
      names.push(tool.schema.name);
    }
    return {
      ok: true,
      output:
        names.length > 0
          ? `mounted ${names.length} tool(s) from ${name}: ${names.join(", ")}`
          : `connected to ${name} — no tools discovered`,
    };
  } catch (err) {
    return { ok: false, output: `mount_mcp: ${(err as Error).message}` };
  }
}

/**
 * Factory that captures the live registry so `mount_mcp` can register new tools
 * into the running session at execution time.
 */
export function buildMountMcpTool(registry: ToolRegistry): Tool {
  return {
    schema: MOUNT_MCP_SCHEMA,
    describeForSafety: (rawArgs) => {
      const r = Args.safeParse(rawArgs);
      if (!r.success) return "mount_mcp (invalid args)";
      return `spawn mcp server ${r.data.name}: ${r.data.command}`;
    },
    execute: (rawArgs) => executeMountMcp(registry, rawArgs),
  };
}
