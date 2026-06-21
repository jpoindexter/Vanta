// VANTA-CHICAGO-MCP (live) — the LIVE routing layer that binds Vanta's
// computer-use actions to a mounted CHICAGO computer-use MCP server.
//
// The PURE routing slice lives in chicago-route.ts (`buildChicagoCall`,
// `parseChicagoResult`, `routeComputerAction`, `chicagoEnabled`). This module is
// the WIRE: it resolves the configured server name, builds a router around an
// injected `callMcp`, and — in production — connects a real mounted MCP client
// and binds the router to its `computer` tool. Every impure seam (the mount, the
// client factory, the raw call) is injected, so the whole connection path is
// unit-testable against a MOCK with NO real MCP server and NO network.
//
// SECURITY: routing a computer-use action through MCP does NOT bypass the kernel.
// The computer-use TOOL gates the action via `describeForSafety` → `assess()`
// BEFORE it ever calls the router (the kernel is the WHETHER, MCP is the WHERE).
// This module never touches the gate; a connect/call failure is a value
// (`{ok:false}`), never a throw.
//
// RAW-RESULT NOTE: `parseChicagoResult` needs the raw MCP `{content:[...]}`
// blocks to read a screenshot's base64 — `McpClient.callTool` flattens to a
// joined text string and would drop the image. So the live `callMcp` is bound to
// a RAW tool caller (the injected `rawCallTool`), not the flattening `callTool`.
// `mcp/client.ts` stays untouched (read-only reuse).

import type { Transport } from "./client.js";
import {
  routeComputerAction,
  CHICAGO_ENV,
  CHICAGO_TOOL,
  type ComputerAction,
  type ChicagoResult,
} from "./chicago-route.js";

/** The injected MCP call seam — returns the RAW `tools/call` result (content blocks). */
export type CallMcp = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

/** A live CHICAGO router: one `run` per computer-use action, errors-as-values. */
export type ChicagoRouter = {
  /** The configured server name this router routes to (for logging/diagnostics). */
  readonly server: string;
  /** Route one action through the mounted CHICAGO `computer` tool. Never throws. */
  run(action: ComputerAction): Promise<ChicagoResult>;
};

/**
 * Resolve the configured CHICAGO MCP server name from the environment.
 * `VANTA_CHICAGO_MCP=<server>` → that server name; unset/blank → null (OFF,
 * the default). Pure — mirrors `chicagoEnabled`, but yields the name to mount.
 */
export function resolveChicagoServer(env: NodeJS.ProcessEnv): string | null {
  const v = env[CHICAGO_ENV];
  if (typeof v !== "string") return null;
  const name = v.trim();
  return name.length > 0 ? name : null;
}

/** Deps for {@link makeChicagoRouter}: the (already-bound) raw MCP call seam. */
export type ChicagoRouterDeps = {
  /** Call the mounted CHICAGO MCP tool, returning the RAW result. THE live boundary. */
  callMcp: CallMcp;
  /** The server name this router is bound to (defaults to "chicago" for diagnostics). */
  server?: string;
};

/**
 * Build a live router around an injected `callMcp` (in production, a mounted
 * `McpClient`'s raw tool caller bound to the computer-use server). Reuses the
 * PURE `routeComputerAction(action, {callMcp})` for every action — this module
 * adds only the binding, not new routing logic. `run` never throws (the pure
 * route already catches a `callMcp` rejection into `{ok:false}`).
 */
export function makeChicagoRouter(deps: ChicagoRouterDeps): ChicagoRouter {
  const server = deps.server ?? "chicago";
  return {
    server,
    run: (action) => routeComputerAction(action, { callMcp: deps.callMcp }),
  };
}

/** A connected, raw-capable MCP client handle the connect seam yields. */
export type ChicagoClient = {
  /** Raw `tools/call` → the unflattened result (content blocks intact). */
  rawCallTool: CallMcp;
  /** Tear down the connection (kill the spawned child / close the transport). */
  close(): void;
};

/** The configured server spec the mount seam resolves (stdio command form). */
export type ChicagoServerSpec = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
};

/**
 * The injected connect seam for {@link connectChicago}. Both functions are the
 * REAL connection boundary, mocked in tests:
 *  - `mountServer(name)` resolves the configured server's spec (from the MCP
 *    config) or null when it isn't configured.
 *  - `createMcpClient(spec)` spawns/connects the server and returns a
 *    raw-capable client (initialize done), or null on a connect failure.
 */
export type ChicagoConnectDeps = {
  mountServer: (name: string) => Promise<ChicagoServerSpec | null>;
  createMcpClient: (spec: ChicagoServerSpec) => Promise<ChicagoClient | null>;
};

/** A router whose every `run` fails closed (used when the connection can't be made). */
function deadRouter(server: string, reason: string): ChicagoRouter {
  return {
    server,
    run: async () => ({ ok: false, error: `CHICAGO MCP unavailable: ${reason}` }),
  };
}

/**
 * The REAL connection path: resolve the configured server, mount + connect it,
 * and return a live router bound to its raw `computer`-tool caller. A connect
 * failure (not configured, mount error, client error) yields a router whose
 * `run` returns `{ok:false}` — NEVER throws, so a missing computer-use runtime
 * degrades to "every action fails closed" rather than crashing the agent loop.
 */
export async function connectChicago(
  env: NodeJS.ProcessEnv,
  deps: ChicagoConnectDeps,
): Promise<ChicagoRouter> {
  const server = resolveChicagoServer(env);
  if (!server) return deadRouter("chicago", "VANTA_CHICAGO_MCP is not set");
  try {
    const spec = await deps.mountServer(server);
    if (!spec) return deadRouter(server, `server "${server}" is not configured`);
    const client = await deps.createMcpClient(spec);
    if (!client) return deadRouter(server, `could not connect to "${server}"`);
    return makeChicagoRouter({ callMcp: client.rawCallTool, server });
  } catch (err) {
    return deadRouter(server, (err as Error).message);
  }
}

/** Re-export so callers wire the router without reaching into chicago-route. */
export { CHICAGO_TOOL, type ComputerAction, type ChicagoResult };

/** A transport guard the connect seam can use to assert a real Transport shape. */
export function isTransport(t: unknown): t is Transport {
  return (
    !!t &&
    typeof t === "object" &&
    typeof (t as Transport).send === "function" &&
    typeof (t as Transport).onMessage === "function"
  );
}
