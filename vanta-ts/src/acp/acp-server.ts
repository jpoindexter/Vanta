import {
  AGENT_NAME,
  AGENT_VERSION,
  PROTOCOL_VERSION,
  RPC,
  InitializeParams,
  NewSessionParams,
  LoadSessionParams,
  PromptParams,
  CancelParams,
  SetModeParams,
  SetModelParams,
  parseMessage,
  promptText,
  serializeError,
  serializeNotification,
  serializeRequest,
  serializeResult,
} from "./protocol.js";
import { SessionManager } from "./session.js";
import type { JsonRpcId } from "./protocol.js";
import type { AgentRunner, SessionUpdate, PermissionRequest } from "./session.js";

// ACP stdio JSON-RPC SERVER — wires the pure protocol codec + SessionManager over
// an INJECTABLE transport (real stdio in production, a fake in tests). Dispatches
// the core ACP methods, streams `session/update` notifications, and issues
// agent→client `session/request_permission` requests, correlating their responses.

/** The injectable line transport — the same shape as mcp/server.ts ServerTransport. */
export interface AcpTransport {
  send(line: string): void;
  onMessage(cb: (line: string) => void): void;
  onClose(cb: () => void): void;
}

export type AcpServerDeps = {
  /** The injected agent runner — drives one Vanta conversation per prompt turn. */
  runner: AgentRunner;
  /** Default session cwd (the repo root). */
  cwd: string;
};

/** The initialize handshake result — Vanta's advertised ACP capabilities. */
export function buildInitializeResult(): {
  protocolVersion: number;
  agentCapabilities: { loadSession: boolean; promptCapabilities: { image: boolean; audio: boolean } };
  authMethods: never[];
  agentInfo: { name: string; version: string };
} {
  return {
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: { loadSession: true, promptCapabilities: { image: false, audio: false } },
    authMethods: [],
    agentInfo: { name: AGENT_NAME, version: AGENT_VERSION },
  };
}

/**
 * Drive an ACP server over a transport. Returns a promise that resolves when the
 * transport closes (stdin EOF). The session manager + permission correlation are
 * created per call so each server instance is isolated (clean for tests).
 */
export function runAcpServer(transport: AcpTransport, deps: AcpServerDeps): Promise<void> {
  const pendingPermissions = new Map<JsonRpcId, (allowed: boolean) => void>();
  let nextOutId = 1;

  const sink = {
    update(sessionId: string, update: SessionUpdate): void {
      transport.send(serializeNotification("session/update", { sessionId, update }));
    },
    requestPermission(sessionId: string, req: PermissionRequest): Promise<boolean> {
      const id = `perm-${nextOutId++}`;
      return new Promise<boolean>((resolve) => {
        pendingPermissions.set(id, resolve);
        transport.send(serializeRequest(id, "session/request_permission", { sessionId, ...req }));
      });
    },
  };
  const manager = new SessionManager(deps.runner, sink, deps.cwd);

  return new Promise<void>((resolve) => {
    let buffer = "";
    transport.onMessage((chunk) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        void handleLine(line, manager, transport, pendingPermissions);
      }
    });
    transport.onClose(() => {
      for (const resolveOne of pendingPermissions.values()) resolveOne(false);
      pendingPermissions.clear();
      resolve();
    });
  });
}

/** Resolve a client's permission outcome → allowed boolean. `selected` allow* = true. */
function permissionAllowed(result: unknown): boolean {
  const outcome = (result as { outcome?: { outcome?: string; optionId?: string } } | undefined)?.outcome;
  if (!outcome || outcome.outcome !== "selected") return false;
  return outcome.optionId === "allow" || String(outcome.optionId).startsWith("allow");
}

/** Parse one inbound line and dispatch it; emits a response/error for requests. */
async function handleLine(
  line: string,
  manager: SessionManager,
  transport: AcpTransport,
  pending: Map<JsonRpcId, (allowed: boolean) => void>,
): Promise<void> {
  const inbound = parseMessage(line);
  if (inbound.kind === "parse_error") {
    transport.send(serializeError(inbound.id, RPC.PARSE_ERROR, inbound.reason));
    return;
  }
  if (inbound.kind === "response") {
    const resolveOne = pending.get(inbound.id);
    if (resolveOne) {
      pending.delete(inbound.id);
      resolveOne(inbound.error ? false : permissionAllowed(inbound.result));
    }
    return;
  }
  if (inbound.kind === "notification") {
    dispatchNotification(inbound.method, inbound.params, manager);
    return;
  }
  await dispatchRequest(inbound, manager, transport);
}

/** Handle a notification (no response). Only `session/cancel` is actioned. */
function dispatchNotification(method: string, params: unknown, manager: SessionManager): void {
  if (method !== "session/cancel") return;
  const parsed = CancelParams.safeParse(params);
  if (parsed.success) manager.cancel(parsed.data.sessionId);
}

type RequestInbound = { id: JsonRpcId; method: string; params: unknown };

/** Handle a request: dispatch the core method, serialize its result or an error. */
async function dispatchRequest(req: RequestInbound, manager: SessionManager, transport: AcpTransport): Promise<void> {
  try {
    const result = await routeMethod(req.method, req.params, manager);
    if (result === undefined) {
      transport.send(serializeError(req.id, RPC.METHOD_NOT_FOUND, `method not found: ${req.method}`));
      return;
    }
    transport.send(serializeResult(req.id, result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = message.startsWith("invalid params") ? RPC.INVALID_PARAMS : RPC.INTERNAL_ERROR;
    transport.send(serializeError(req.id, code, message));
  }
}

/** Route a request method to its handler. Returns undefined for unknown methods. */
async function routeMethod(method: string, params: unknown, manager: SessionManager): Promise<unknown> {
  switch (method) {
    case "initialize":
      InitializeParams.parse(params ?? {});
      return buildInitializeResult();
    case "session/new":
      return manager.newSession(NewSessionParams.parse(params ?? {}).cwd);
    case "session/load":
      return loadSession(params, manager);
    case "session/prompt":
      return promptSession(params, manager);
    case "session/set_mode":
      return setMode(params, manager);
    case "session/set_model":
      // Vanta resolves its model from env/config; accept + ack so the editor's
      // model picker doesn't error. The chosen modelId is recorded as a mode echo.
      return setModel(params, manager);
    default:
      return undefined;
  }
}

function requireSession(sessionId: string, manager: SessionManager): void {
  if (!manager.has(sessionId)) throw new Error(`invalid params: unknown session ${sessionId}`);
}

function loadSession(params: unknown, manager: SessionManager): { sessionId: string } {
  const p = parse(LoadSessionParams, params);
  return manager.loadSession(p.sessionId, p.cwd);
}

async function promptSession(params: unknown, manager: SessionManager): Promise<{ stopReason: string }> {
  const p = parse(PromptParams, params);
  requireSession(p.sessionId, manager);
  return manager.prompt(p.sessionId, promptText(p.prompt));
}

function setMode(params: unknown, manager: SessionManager): Record<string, never> {
  const p = parse(SetModeParams, params);
  requireSession(p.sessionId, manager);
  manager.setMode(p.sessionId, p.modeId);
  return {};
}

function setModel(params: unknown, manager: SessionManager): Record<string, never> {
  const p = parse(SetModelParams, params);
  requireSession(p.sessionId, manager);
  manager.setMode(p.sessionId, p.modelId);
  return {};
}

/** zod-parse with a normalized "invalid params" error so the router maps the code. */
function parse<T>(schema: { parse: (v: unknown) => T }, params: unknown): T {
  try {
    return schema.parse(params ?? {});
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid params: ${detail}`);
  }
}

/** Real stdio transport: read JSON-RPC from stdin, write to stdout. */
export function stdioTransport(): AcpTransport {
  return {
    send: (line) => process.stdout.write(line),
    onMessage: (cb) => process.stdin.on("data", (d: Buffer) => cb(d.toString("utf8"))),
    onClose: (cb) => process.stdin.on("end", cb),
  };
}
