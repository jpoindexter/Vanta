import { readMcpConfig } from "../mcp/mount.js";
import { McpClient, stdioTransport } from "../mcp/client.js";
import { mcpClientEvents } from "../mcp/events.js";
import type { ShellHookResult } from "./shell-hook-run.js";
import type { ShellHook } from "./shell-hooks.js";

/**
 * Run a `type: "mcp_tool"` hook: spawns a fresh connection to the named MCP
 * server, calls the tool with the hook context as input, then closes.
 * Returns a ShellHookResult-shaped value so callers treat it the same as a
 * shell hook result (code 0 = success, non-zero = error).
 */
export async function runMcpToolHook(
  hook: ShellHook,
  contextJson: string,
  opts: { cwd?: string } = {},
): Promise<ShellHookResult> {
  const { server, tool } = hook;
  if (!server || !tool) return { code: 1, stdout: "", stderr: "mcp_tool hook requires server and tool" };
  const serverCfg = (await readMcpConfig(process.env, opts.cwd ?? process.cwd())).servers[server];
  if (!serverCfg?.command) return { code: 1, stdout: "", stderr: `MCP server "${server}" not in config or has no command` };
  const env = serverCfg.env ? { ...process.env, ...serverCfg.env } : process.env;
  const { transport, child } = stdioTransport(serverCfg.command, serverCfg.args ?? [], env);
  const cwd = opts.cwd ?? process.cwd();
  const client = new McpClient(transport, mcpClientEvents(cwd, server));
  const args = parseContext(contextJson);
  try {
    await client.initialize();
    const result = await client.callTool(tool, args);
    return { code: 0, stdout: result, stderr: "" };
  } catch (err) {
    return { code: 1, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  } finally {
    client.close();
    child.kill();
  }
}

function parseContext(contextJson: string): Record<string, unknown> {
  try {
    return JSON.parse(contextJson) as Record<string, unknown>;
  } catch {
    return { raw: contextJson };
  }
}
