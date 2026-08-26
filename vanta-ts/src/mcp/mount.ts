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
  resolveMcpStdioArgs,
  validateScraplingToolArgs,
  type ServerSpec,
  type McpTrust,
} from "./mount-config.js";
import { loadSettings, type Settings } from "../settings/store.js";
import { serverAccessDecision } from "../settings/mcp-access.js";
import {
  executeEffect,
  payloadSha256,
  stableEffectId,
  type EffectExecutionResult,
  type EffectGateContext,
} from "../effects/execute-effect.js";
import { applyMcpToolPolicy, mcpTrustDecisionKey } from "./tool-policy.js";

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
  resolveMcpStdioArgs,
  validateScraplingToolArgs,
  type McpConfig,
  type McpTrust,
} from "./mount-config.js";
export { mcpTrustDecisionKey } from "./tool-policy.js";

export type MountResult = { servers: string[]; toolCount: number; dispose: () => void };

type TransportOptions = {
  name: string;
  spec: ServerSpec;
  env: NodeJS.ProcessEnv;
  children: Array<{ kill: () => void }>;
  root: string;
};

async function resolveTransport(opts: TransportOptions): Promise<Transport | null> {
  const { name, spec, env, children, root } = opts;
  if (spec.url) {
    const { httpTransport, resolveToken } = await import("./http-transport.js");
    // A previously-stored OAuth access token wins over a static config token.
    const stored = await loadMcpToken(name, env);
    const token = stored?.access_token ?? resolveToken(name, spec.token, env);
    const headers = Object.fromEntries(Object.entries(spec.headers ?? {}).flatMap(([key, value]) => {
      const resolved = resolveToken(name, value, env);
      return resolved ? [[key, resolved]] : [];
    }));
    return httpTransport(spec.url, { token, headers });
  }
  if (spec.command) {
    const t = stdioTransport(spec.command, resolveMcpStdioArgs(spec, root), buildMcpChildEnv(env, spec.env));
    children.push({ kill: () => t.child.kill() });
    return t.transport;
  }
  return null;
}

type MountServerOptions = {
  name: string;
  spec: ServerSpec;
  registry: ToolRegistry;
  env: NodeJS.ProcessEnv;
  children: Array<{ kill: () => void }>;
  deferred: boolean;
  cwd: string;
  log: (msg: string) => void;
  trust?: McpTrust;
  effectGate?: EffectGateContext;
};

async function confirmMcpTrust(opts: MountServerOptions): Promise<boolean> {
  const { name, spec, trust, log } = opts;
  if (!trust) return true;
  const tools = (spec.tools ?? []).map((tool) => ({ name: tool }));
  const launch = spec.command
    ? { command: spec.command, args: spec.args ?? [] }
    : { url: spec.url };
  const trusted = await resolveMcpTrust(trust.root, name, tools, trust.confirm, {
    decisionKey: mcpTrustDecisionKey(name, spec),
    launch,
  });
  if (!trusted) log(`  · mcp: ${name} skipped — not trusted`);
  return trusted;
}

async function describeMcpLaunch(opts: MountServerOptions): Promise<string> {
  const { name, spec, env } = opts;
  const authenticated = spec.url
    ? Boolean((await loadMcpToken(name, env))?.access_token)
    : false;
  return JSON.stringify({
    command: spec.command,
    args: spec.args ?? [],
    url: spec.url,
    tools: spec.tools ?? null,
    authenticated,
  });
}

function unwrapMcpLaunch<T>(name: string, launched: EffectExecutionResult<T>): T {
  if ((launched.outcome === "confirmed" || launched.outcome === "verified") && launched.value) {
    return launched.value;
  }
  if (launched.operationError && isAuthRequiredError(launched.operationError)) throw launched.operationError;
  throw new Error(`MCP ${name} launch ${launched.outcome}`);
}

async function launchConfiguredMcp(opts: MountServerOptions) {
  const { name, spec, env, children, cwd, effectGate } = opts;
  if (!effectGate) throw new Error(`blocked: MCP ${name} launch effect gate unavailable`);
  const launchDescription = await describeMcpLaunch(opts);
  const digest = payloadSha256(launchDescription);
  const sessionId = effectGate.sessionId ?? "one-shot";
  const remote = Boolean(spec.url);
  const seed = {
    host: "mcp-host",
    kind: "mcp.server.launch",
    targetClass: remote ? "remote-mcp-server" : "local-mcp-process",
    payloadSha256: digest,
    idempotencyKey: `mcp:${sessionId}:${name}:${digest}`,
  };
  const launched = await executeEffect({
    id: stableEffectId(seed),
    actor: `mcp:${name}`,
    action: `launch and initialize MCP server ${name}`,
    ...seed,
  }, effectGate, async () => {
    const transport = await resolveTransport({ name, spec, env, children, root: cwd });
    if (!transport) throw new Error("no command or url");
    const client = new McpClient(transport, mcpClientEvents(cwd, name));
    await client.initialize();
    return { value: { client, defs: await client.listTools() }, acknowledgementId: `${name}:initialized` };
  });
  return unwrapMcpLaunch(name, launched);
}

async function mountOneServer(opts: MountServerOptions): Promise<number> {
  const { name, spec, registry, deferred, log } = opts;
  if (!(await confirmMcpTrust(opts))) return 0;
  if (spec.command) {
    const risk = detectMcpEgressRisk(spec.command, spec.args ?? []);
    if (risk.risky) log(formatEgressWarning(name, risk.reason));
  }
  const { client, defs } = await launchConfiguredMcp(opts);
  const mountDefs = applyMcpToolPolicy(defs, spec.tools);
  for (const def of mountDefs) registry.register(mcpToolToVantaTool(client, name, def, { deferred }));
  const skipped = defs.length - mountDefs.length;
  log(`  · mcp: mounted ${name} (${mountDefs.length} tool(s)${skipped ? `, ${skipped} not in allowlist` : ""})${spec.url ? " [http]" : ""}`);
  return mountDefs.length;
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
  opts: { cwd?: string; trust?: McpTrust; pending?: AuthPendingRegistry; effectGate?: EffectGateContext } = {},
): Promise<MountResult> {
  const cwd = opts.cwd ?? process.cwd();
  const trust = opts.trust;
  const pending = opts.pending ?? authPending;
  const config = await readMcpConfig(env, cwd);
  const settings = await loadSettings(cwd, env).catch(() => ({} as Settings));
  const configuredNames = Object.keys(config.servers);
  const names = configuredNames.filter((name) => serverAccessDecision(name, settings.mcp ?? {}) === "allow");
  for (const name of configuredNames) {
    if (!names.includes(name)) log(`  · mcp: ${name} disabled for this project`);
  }
  if (names.length === 0) return { servers: [], toolCount: 0, dispose: () => {} };
  const children: Array<{ kill: () => void }> = [];
  const mounted: string[] = [];
  let toolCount = 0;
  const deferred = env.VANTA_MCP_DEFER === "1";

  for (const name of names) {
    const spec = config.servers[name];
    if (!spec) continue;
    try {
      const count = await mountOneServer({
        name,
        spec,
        registry,
        env,
        children,
        deferred,
        cwd,
        log,
        trust,
        effectGate: opts.effectGate,
      });
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
