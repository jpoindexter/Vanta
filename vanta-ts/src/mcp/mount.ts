import { McpClient, stdioTransport, type Transport } from "./client.js";
import { mcpClientEvents } from "./events.js";
import { detectMcpEgressRisk, formatEgressWarning } from "./egress-warn.js";
import type { ToolRegistry } from "../tools/registry.js";
import { resolveMcpTrust } from "../settings/trust-gate.js";
import { isAuthRequiredError } from "./auth-detect.js";
import { authPending, type AuthPendingRegistry } from "./auth-pending.js";
import { loadMcpToken } from "./auth-store.js";
import {
  readMcpConfig,
  mcpToolToVantaTool,
  buildMcpChildEnv,
  extractAuthConfig,
  type ServerSpec,
  type McpTrust,
} from "./mount-config.js";

// Mount external MCP servers as Vanta tools. Config parsing + tool mapping are
// pure helpers in mount-config.ts (re-exported below); this file owns the live
// spawn/connect/register lifecycle. No config → no-op (zero overhead). Each
// server is best-effort: one that fails to start doesn't block the others or the
// session. MCP tools go through the kernel `assess()` like every other tool.

// Re-export the config-layer public surface so importers + tests need no edits.
export {
  readMcpConfig,
  mcpToolToVantaTool,
  buildMcpChildEnv,
  extractAuthConfig,
  type McpConfig,
  type McpTrust,
} from "./mount-config.js";

export type MountResult = { servers: string[]; toolCount: number; dispose: () => void };

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
  if (spec.command) {
    const risk = detectMcpEgressRisk(spec.command, spec.args ?? []);
    if (risk.risky) log(formatEgressWarning(name, risk.reason));
  }
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
