// VANTA-CHICAGO-MCP (live) — the REAL mount + connect seam for connectChicago.
//
// Resolves the configured CHICAGO server from the MCP config, spawns/connects it,
// and returns a raw-capable client whose `rawCallTool` returns the UNFLATTENED
// `tools/call` result (content blocks intact) — which `parseChicagoResult` needs
// to read a screenshot's base64. `mcp/client.ts`'s `callTool` flattens to a text
// string and would drop the image, and that file is off-limits this round, so
// this module drives a minimal raw JSON-RPC caller over the SAME `stdioTransport`
// (read-only reuse) rather than reaching into `McpClient`'s private `request`.
//
// Every impure step is wrapped: a config read / spawn / handshake failure surfaces
// as a `connectChicago` `{ok:false}` router (the caller, vision-action, then keeps
// the local driver or fails the click closed). This module owns only the WHERE
// (where the click executes); the kernel `assess()` gate is upstream in the tool.

import { stdioTransport, type Transport } from "./client.js";
import { readMcpConfig } from "./mount.js";
import { buildMcpChildEnv } from "./mount.js";
import type {
  ChicagoConnectDeps,
  ChicagoServerSpec,
  ChicagoClient,
  CallMcp,
} from "./chicago-client.js";

const PROTOCOL_VERSION = "2024-11-05";

/** Resolve the CHICAGO server's spec from the merged MCP config (or null). */
async function mountFromConfig(env: NodeJS.ProcessEnv, cwd: string, name: string): Promise<ChicagoServerSpec | null> {
  const config = await readMcpConfig(env, cwd);
  const spec = config.servers[name];
  if (!spec) return null;
  return { command: spec.command, args: spec.args, env: spec.env, url: spec.url };
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/**
 * A minimal raw JSON-RPC caller over a stdio Transport: enough to `initialize`
 * the server and issue raw `tools/call`s that return the UNFLATTENED result.
 * Parallel to (not a fork of) McpClient — that client flattens tool results to
 * text, which loses screenshot bytes. Newline-delimited, concurrent-id-correlated.
 */
function rawCaller(transport: Transport): { call: CallMcp; init: () => Promise<void>; close: () => void } {
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let buffer = "";
  transport.onMessage((chunk) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: { id?: number; result?: unknown; error?: { message?: string } };
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id === undefined) continue;
      const p = pending.get(msg.id);
      if (!p) continue;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? "mcp error"));
      else p.resolve(msg.result);
    }
  });
  transport.onError((err) => { for (const p of pending.values()) p.reject(err); pending.clear(); });

  const request = (method: string, params?: unknown): Promise<unknown> => {
    const id = nextId++;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      transport.send(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };

  return {
    init: async () => {
      await request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "vanta-chicago", version: "0.1.0" },
      });
      transport.send(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    },
    call: (tool, args) => request("tools/call", { name: tool, arguments: args }),
    close: () => transport.close(),
  };
}

/** Spawn + handshake the configured stdio server, returning a raw-capable client. */
async function createStdioClient(env: NodeJS.ProcessEnv, spec: ChicagoServerSpec): Promise<ChicagoClient | null> {
  if (!spec.command) return null; // only stdio computer-use servers this round
  const { transport, child } = stdioTransport(spec.command, spec.args ?? [], buildMcpChildEnv(env, spec.env));
  const caller = rawCaller(transport);
  await caller.init();
  return {
    rawCallTool: caller.call,
    close: () => { try { caller.close(); } catch { /* already gone */ } try { child.kill(); } catch { /* already gone */ } },
  };
}

/**
 * The production connect seam: resolve the configured CHICAGO server from the MCP
 * config and connect it for real. Pass to {@link connectChicago}. Pure of args —
 * `env`/`cwd` are read at call time; spawning is the documented runtime boundary.
 */
export function resolveChicagoConnect(env: NodeJS.ProcessEnv, cwd: string = process.cwd()): ChicagoConnectDeps {
  return {
    mountServer: (name) => mountFromConfig(env, cwd, name),
    createMcpClient: (spec) => createStdioClient(env, spec),
  };
}
