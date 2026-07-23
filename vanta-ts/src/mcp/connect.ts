import { McpClient, stdioTransport, type Transport } from "./client.js";
import { buildMcpChildEnv, readMcpConfig, type McpConfig } from "./mount.js";
import type { McpServerView } from "../ui/mcp-view.js";
import { appendMcpReceipt, readMcpRegistry, recordMcpProbe, type McpConnectorRecord } from "./registry.js";

// Live connection layer for the MCP management panel. Connects to each configured
// server (best-effort), captures connected/error status + discovered tools, and
// keeps the live client so a failed server can be reconnected and so a server's
// mid-call elicitation request can be routed to the host UI. Separate from
// mount.ts (which registers tools into the agent registry) — this is read/manage
// only, for the panel.

type ServerSpec = McpConfig["servers"][string];

/** Host callback a server's elicitation request is routed to. Returns the MCP
 * elicitation result (`{action, content}`). Omitted → the client cancels. */
export type ElicitHandler = (req: { server: string; method: string; params: unknown }) => Promise<Record<string, unknown>>;

/** A connected (or failed) server plus the live client used for reconnect. */
export type McpConnection = McpServerView & { client?: McpClient };

async function resolveTransport(name: string, spec: ServerSpec, env: NodeJS.ProcessEnv): Promise<{ transport: Transport; kind: "stdio" | "http" } | null> {
  if (spec.url) {
    const { httpTransport, resolveToken } = await import("./http-transport.js");
    const { loadMcpToken } = await import("./auth-store.js");
    // A stored OAuth access token (from the mcp_auth flow) wins over a static one.
    const stored = await loadMcpToken(name, env);
    const token = stored?.access_token ?? resolveToken(name, spec.token, env);
    const headers = Object.fromEntries(Object.entries(spec.headers ?? {}).flatMap(([key, value]) => {
      const resolved = resolveToken(name, value, env);
      return resolved ? [[key, resolved]] : [];
    }));
    return { transport: httpTransport(spec.url, { token, headers }), kind: "http" };
  }
  if (spec.command) {
    const t = stdioTransport(spec.command, spec.args ?? [], buildMcpChildEnv(env, spec.env));
    return { transport: t.transport, kind: "stdio" };
  }
  return null;
}

/** Connect to one server: initialize + list tools. Errors become a view, never throw. */
export async function connectServer(name: string, spec: ServerSpec, opts: { env: NodeJS.ProcessEnv; onElicit?: ElicitHandler; root?: string; record?: McpConnectorRecord }): Promise<McpConnection> {
  const resolved = await resolveTransport(name, spec, opts.env).catch(() => null);
  const transport = resolved?.transport;
  const kind = resolved?.kind ?? (spec.url ? "http" : "stdio");
  if (!transport) return { name, transport: kind, status: "error", error: "no command or url configured", tools: [] };
  const client = new McpClient(transport, opts.onElicit ? { onElicitation: (r) => opts.onElicit!({ server: name, method: r.method, params: r.params }) } : {});
  try {
    await client.initialize();
    const tools = await client.listTools();
    const resources = await client.listResources().catch(() => []);
    if (opts.root) await recordMcpProbe(opts.root, name, { ok: true, tools: tools.map((tool) => tool.name), resources: resources.map((resource) => resource.uri) });
    return { name, transport: kind, status: "connected", tools, resources, client, source: opts.record?.source, trust: opts.record?.trust, auth: opts.record?.auth };
  } catch (err) {
    try { client.close(); } catch { /* already gone */ }
    if (opts.root) await recordMcpProbe(opts.root, name, { ok: false, error: (err as Error).message });
    return { name, transport: kind, status: "error", error: (err as Error).message, tools: [] };
  }
}

/** Connect to every configured MCP server. Best-effort per server; never throws. */
export async function gatherMcpConnections(opts: { env?: NodeJS.ProcessEnv; cwd?: string; onElicit?: ElicitHandler } = {}): Promise<McpConnection[]> {
  const env = opts.env ?? process.env;
  const root = opts.cwd ?? process.cwd();
  const [config, records] = await Promise.all([
    readMcpConfig(env, root).catch(() => ({ servers: {} }) as McpConfig),
    readMcpRegistry(root, env).catch(() => []),
  ]);
  const byName = new Map(records.map((record) => [record.name, record]));
  return Promise.all(Object.keys(config.servers).map((name) => {
    const record = byName.get(name);
    if (record && !record.enabled) {
      return { name, transport: record.transport, status: "disabled", tools: [], resources: [], source: record.source, trust: record.trust, auth: record.auth } satisfies McpConnection;
    }
    if (record?.auth === "needs_auth") {
      return { name, transport: record.transport, status: "needs_auth", tools: [], resources: [], source: record.source, trust: record.trust, auth: record.auth } satisfies McpConnection;
    }
    return connectServer(name, config.servers[name]!, { env, onElicit: opts.onElicit, root, record });
  }));
}

/** Reconnect a single server by name (re-reads config, re-runs connect). */
export async function reconnectServer(name: string, opts: { env?: NodeJS.ProcessEnv; cwd?: string; onElicit?: ElicitHandler; previous?: McpConnection } = {}): Promise<McpConnection> {
  try { opts.previous?.client?.close(); } catch { /* already gone */ }
  const env = opts.env ?? process.env;
  const root = opts.cwd ?? process.cwd();
  const [config, records] = await Promise.all([
    readMcpConfig(env, root).catch(() => ({ servers: {} }) as McpConfig),
    readMcpRegistry(root, env).catch(() => []),
  ]);
  const spec = config.servers[name];
  if (!spec) return { name, transport: "stdio", status: "error", error: "server not in config", tools: [] };
  const record = records.find((item) => item.name === name);
  const result = await connectServer(name, spec, { env, onElicit: opts.onElicit, root, record });
  await appendMcpReceipt(root, {
    action: "reconnect",
    server: name,
    outcome: result.status === "connected" ? "passed" : "failed",
    detail: result.status === "connected" ? `${result.tools.length} tools, ${result.resources?.length ?? 0} resources` : result.error ?? result.status,
  });
  return result;
}
