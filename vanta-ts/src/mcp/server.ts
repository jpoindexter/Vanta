import type { KernelClient } from "../kernel/client.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Tool, ToolContext } from "../tools/types.js";
import { listSessions, loadSession } from "../sessions/store.js";

// Minimal MCP (Model Context Protocol) SERVER — the mirror of client.ts. Exposes
// Vanta's own tools over stdio JSON-RPC so an external host (e.g. an MCP client) can
// call them. EVERY call passes through the kernel `assess()` gate, exactly like
// the agent loop's dispatchTool. No SDK dependency.
//
// Two layers of control:
//   1. Allowlist (exposure) — only allowlisted tools appear in tools/list and are
//      callable. Defaults to a read-only safe set; override via VANTA_MCP_SERVE_TOOLS.
//   2. Kernel gate (enforcement) — assess() classifies each call. `block` and
//      `ask` are refused (a headless stdio server has no human to prompt); only
//      `allow` executes. The kernel is the real boundary; the allowlist is not.

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "vanta", version: "0.1.0" } as const;

// Read-only tools safe to expose out of the box. The kernel still gates each call
// (a read_file outside scope is still asked/blocked); this just bounds visibility.
const DEFAULT_SERVE_TOOLS = [
  "read_file",
  "inspect_state",
  "web_search",
  "web_fetch",
  "recall",
  "lsp_diagnostics",
  "lsp_definition",
  "git_status",
  "git_diff",
] as const;

const BRIDGE_TOOLS = {
  vanta_approval_resolve: {
    name: "vanta_approval_resolve",
    description: "Approve or deny a pending Vanta approval by id. Opt-in via VANTA_MCP_SERVE_TOOLS.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" }, decision: { type: "string", enum: ["approve", "deny"] } },
      required: ["id", "decision"],
    },
  },
} as const;

/** Resolve the set of tool names exposed over MCP serve. Env overrides the default. */
export function resolveServeAllowlist(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.VANTA_MCP_SERVE_TOOLS?.trim();
  if (raw) return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return new Set(DEFAULT_SERVE_TOOLS);
}

export interface ServerTransport {
  send(line: string): void;
  onMessage(cb: (line: string) => void): void;
  onClose(cb: () => void): void;
}

export type ServerDeps = {
  registry: ToolRegistry;
  safety: KernelClient;
  ctx: ToolContext;
  allowlist: Set<string>;
  env?: NodeJS.ProcessEnv;
};

type RpcMessage = { jsonrpc?: string; id?: number | string | null; method?: string; params?: unknown };

/** The `initialize` handshake result. Shape per MCP 2024-11-05. */
export function buildInitializeResult(): {
  protocolVersion: string;
  capabilities: { tools: Record<string, never>; resources: Record<string, never> };
  serverInfo: { name: string; version: string };
} {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: {}, resources: {} },
    serverInfo: { ...SERVER_INFO },
  };
}

/** Map an Vanta Tool to an MCP tool definition. */
export function buildToolDef(tool: Tool): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
} {
  return {
    name: tool.schema.name,
    description: tool.schema.description,
    inputSchema: tool.schema.parameters ?? { type: "object", properties: {} },
  };
}

function ok(id: RpcMessage["id"], result: unknown): object {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: RpcMessage["id"], code: number, message: string): object {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** An MCP tools/call result carrying text content + an error flag. */
function toolResult(text: string, isError: boolean): object {
  return { content: [{ type: "text", text }], isError };
}

function content(uri: string, value: unknown): object {
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }] };
}

function listResources(): object {
  return {
    resources: [
      { uri: "vanta://sessions", name: "Vanta sessions", description: "Recent persisted Vanta sessions", mimeType: "application/json" },
      { uri: "vanta://approvals", name: "Vanta approvals", description: "Pending kernel approvals", mimeType: "application/json" },
    ],
  };
}

async function readResource(uri: string, deps: ServerDeps): Promise<object> {
  const env = deps.env ?? process.env;
  if (uri === "vanta://sessions") return content(uri, await listSessions(env));
  if (uri.startsWith("vanta://sessions/")) {
    const id = decodeURIComponent(uri.slice("vanta://sessions/".length));
    return content(uri, await loadSession(id, env));
  }
  if (uri === "vanta://approvals") return content(uri, await deps.safety.getApprovals());
  return { contents: [] };
}

function bridgeToolDefs(deps: ServerDeps): Array<(typeof BRIDGE_TOOLS)[keyof typeof BRIDGE_TOOLS]> {
  return Object.values(BRIDGE_TOOLS).filter((tool) => deps.allowlist.has(tool.name));
}

async function callBridgeTool(name: string, args: Record<string, unknown>, deps: ServerDeps): Promise<object | null> {
  if (name !== "vanta_approval_resolve") return null;
  const id = Number(args.id);
  const decision = String(args.decision ?? "");
  if (!Number.isInteger(id) || !["approve", "deny"].includes(decision)) return toolResult("id and decision are required", true);
  const verdict = await deps.safety.assess(`${decision} pending approval ${id} via MCP serve`);
  if (verdict.risk !== "allow") return toolResult(`approval resolution refused: ${verdict.reason}`, true);
  if (decision === "approve") await deps.safety.approve(id);
  else await deps.safety.deny(id);
  return toolResult(`${decision}d approval ${id}`, false);
}

/**
 * Run one tool call through the kernel gate. `block`/`ask` are refused with a
 * readable reason (returned as an isError tool result, NOT a JSON-RPC error —
 * a gate refusal is a tool outcome, not a transport fault). Only `allow` executes.
 */
async function callTool(
  name: string,
  args: Record<string, unknown>,
  deps: ServerDeps,
): Promise<object> {
  if (!deps.allowlist.has(name)) {
    return toolResult(`tool not exposed over MCP serve: ${name}`, true);
  }
  const bridgeResult = await callBridgeTool(name, args, deps);
  if (bridgeResult) return bridgeResult;
  const tool = deps.registry.get(name);
  if (!tool) return toolResult(`unknown tool: ${name}`, true);

  const action = tool.describeForSafety
    ? tool.describeForSafety(args)
    : `${name} ${JSON.stringify(args)}`;
  const verdict = await deps.safety.assess(action);

  if (verdict.risk === "block") {
    return toolResult(`blocked by safety: ${verdict.reason}`, true);
  }
  if (verdict.risk === "ask") {
    return toolResult(
      `requires human approval (not available over MCP serve): ${verdict.reason}`,
      true,
    );
  }
  const res = await tool.execute(args, deps.ctx);
  return toolResult(res.output || "(empty result)", !res.ok);
}

function toolsListResult(deps: ServerDeps): object {
  const tools = deps.registry
    .list()
    .filter((t) => deps.allowlist.has(t.schema.name))
    .map(buildToolDef);
  return { tools: [...tools, ...bridgeToolDefs(deps)] };
}

async function handleToolCall(id: RpcMessage["id"], params: unknown, deps: ServerDeps): Promise<object> {
  const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
  if (!p.name) return rpcError(id, -32602, "tools/call requires a 'name' param");
  return ok(id, await callTool(p.name, p.arguments ?? {}, deps));
}

async function handleResourceRead(id: RpcMessage["id"], params: unknown, deps: ServerDeps): Promise<object> {
  const p = (params ?? {}) as { uri?: string };
  if (!p.uri) return rpcError(id, -32602, "resources/read requires a 'uri' param");
  return ok(id, await readResource(p.uri, deps));
}

/**
 * Handle one parsed JSON-RPC message. Returns the response object, or null for
 * notifications (no id) and the `initialized` notification. Unknown methods get
 * a JSON-RPC error; tool outcomes (including gate refusals) get a result.
 */
export async function handleMessage(msg: RpcMessage, deps: ServerDeps): Promise<object | null> {
  const { id, method } = msg;
  // A notification (no id) we don't act on — e.g. notifications/initialized.
  if (id === undefined || id === null) return null;

  switch (method) {
    case "initialize":
      return ok(id, buildInitializeResult());
    case "tools/list":
      return ok(id, toolsListResult(deps));
    case "tools/call":
      return handleToolCall(id, msg.params, deps);
    case "resources/list":
      return ok(id, listResources());
    case "resources/read":
      return handleResourceRead(id, msg.params, deps);
    default:
      return rpcError(id, -32601, `method not found: ${method ?? "(none)"}`);
  }
}

/**
 * Drive the server over a transport: buffer newline-delimited JSON-RPC, dispatch
 * each line, write responses. Resolves when the transport closes (stdin EOF).
 */
export function runMcpServer(transport: ServerTransport, deps: ServerDeps): Promise<void> {
  return new Promise<void>((resolve) => {
    let buffer = "";
    transport.onMessage((chunk) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg: RpcMessage;
        try {
          msg = JSON.parse(line) as RpcMessage;
        } catch {
          continue; // ignore non-JSON — can't correlate to an id
        }
        void handleMessage(msg, deps).then((response) => {
          if (response) transport.send(`${JSON.stringify(response)}\n`);
        });
      }
    });
    transport.onClose(() => resolve());
  });
}

/** Real stdio transport: read JSON-RPC from stdin, write responses to stdout. */
export function stdioServerTransport(): ServerTransport {
  return {
    send: (line) => process.stdout.write(line),
    onMessage: (cb) => process.stdin.on("data", (d: Buffer) => cb(d.toString("utf8"))),
    onClose: (cb) => process.stdin.on("end", cb),
  };
}
