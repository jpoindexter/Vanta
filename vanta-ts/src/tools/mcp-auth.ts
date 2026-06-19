import { z } from "zod";
import { startMcpAuth } from "../mcp/auth-flow.js";
import { loadMcpToken } from "../mcp/auth-store.js";
import { authPending, type AuthPendingRegistry } from "../mcp/auth-pending.js";
import { mcpToolToVantaTool, readMcpConfig } from "../mcp/mount.js";
import { connectServer } from "../mcp/connect.js";
import type { Tool, ToolResult } from "./types.js";
import type { ToolRegistry } from "./registry.js";

// `mcp_auth` — authorize an MCP server that requires OAuth. When a configured
// server's connection fails with an auth-required signal, mount marks it pending
// and surfaces THIS tool in place of the server's real tools. First call returns
// the consent URL; after the user authorizes (token persisted), a second call
// reconnects the server and registers its real tools into the live registry.
// The auth URL and token are never logged — only the server name reaches the
// kernel via describeForSafety.

const Args = z.object({ server: z.string().min(1) });

const MCP_AUTH_SCHEMA: Tool["schema"] = {
  name: "mcp_auth",
  description:
    "Authorize an MCP server that requires OAuth. Call with the server name to " +
    "get an authorization URL — give it to the user to open and approve. After " +
    "they authorize, call mcp_auth again for the same server to reconnect it and " +
    "make its tools available.",
  parameters: {
    type: "object",
    required: ["server"],
    properties: {
      server: { type: "string", description: "Name of the MCP server to authorize (as configured)." },
    },
  },
};

/** Reconnect a now-authorized server and register its real tools. */
async function finishAuth(opts: {
  server: string;
  registry: ToolRegistry;
  pending: AuthPendingRegistry;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<ToolResult> {
  const { server, registry, pending, cwd, env } = opts;
  const config = await readMcpConfig(env, cwd).catch(() => null);
  const spec = config?.servers[server];
  if (!spec) return { ok: false, output: `mcp_auth: server "${server}" is not in config` };
  const conn = await connectServer(server, spec, { env });
  if (conn.status !== "connected" || !conn.client) {
    return { ok: false, output: `mcp_auth: ${server} still not reachable after auth — ${conn.error ?? "unknown error"}` };
  }
  const names: string[] = [];
  for (const def of conn.tools) {
    const tool = mcpToolToVantaTool(conn.client, server, def);
    registry.register(tool);
    names.push(tool.schema.name);
  }
  pending.clear(server);
  return { ok: true, output: `mcp_auth: ${server} authorized — registered ${names.length} tool(s): ${names.join(", ") || "(none)"}` };
}

/** Begin auth: spin the loopback flow and return the URL for the user to open. */
async function beginAuth(server: string, pending: AuthPendingRegistry, env: NodeJS.ProcessEnv): Promise<ToolResult> {
  const entry = pending.get(server);
  if (!entry) {
    return { ok: false, output: `mcp_auth: server "${server}" is not awaiting authorization. Pending: ${pending.names().join(", ") || "(none)"}` };
  }
  const started = await startMcpAuth(server, entry.authConfig, env);
  if (!started.ok) return { ok: false, output: `mcp_auth: could not start auth for ${server} — ${started.error}` };
  return {
    ok: true,
    output:
      `Authorize ${server} by opening this URL, then call mcp_auth("${server}") again to finish:\n${started.authUrl}`,
  };
}

async function executeMcpAuth(registry: ToolRegistry, pending: AuthPendingRegistry, rawArgs: unknown, cwd: string): Promise<ToolResult> {
  const r = Args.safeParse(rawArgs);
  if (!r.success) return { ok: false, output: `invalid args: ${r.error.message}` };
  const { server } = r.data;
  const env = process.env;
  // If a token already exists, the user has authorized — reconnect now.
  if (await loadMcpToken(server, env)) return finishAuth({ server, registry, pending, cwd, env });
  return beginAuth(server, pending, env);
}

/**
 * Factory capturing the live registry (so reconnect can register the server's
 * real tools) and the pending registry (the process-wide one by default, an
 * injected one in tests). Mirrors the `mount_mcp` factory wiring in buildRegistry.
 */
export function buildMcpAuthTool(registry: ToolRegistry, pending: AuthPendingRegistry = authPending): Tool {
  return {
    schema: MCP_AUTH_SCHEMA,
    describeForSafety: (rawArgs) => {
      const r = Args.safeParse(rawArgs);
      return r.success ? `mcp auth ${r.data.server}` : "mcp_auth (invalid args)";
    },
    execute: (rawArgs, ctx) => executeMcpAuth(registry, pending, rawArgs, ctx.root),
  };
}
