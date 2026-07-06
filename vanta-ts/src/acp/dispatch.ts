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
  serializeResult,
} from "./protocol.js";
import { SessionManager } from "./session.js";
import type { JsonRpcId } from "./protocol.js";
import type { AcpTransport } from "./acp-server.js";

// ACP JSON-RPC method routing — parses one inbound line, correlates permission
// responses, and dispatches the core ACP methods to the SessionManager. The
// server lifecycle/transport lives in ./acp-server.js; this is the routing half
// (it owns only the per-request response/error it emits, not the transport).

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

/** Resolve a client's permission outcome → the selected optionId ("" = denied/unselected). */
function permissionOptionId(result: unknown): string {
  const outcome = (result as { outcome?: { outcome?: string; optionId?: string } } | undefined)?.outcome;
  if (!outcome || outcome.outcome !== "selected") return "";
  return String(outcome.optionId ?? "");
}

/** Parse one inbound line and dispatch it; emits a response/error for requests. */
export async function handleLine(
  line: string,
  manager: SessionManager,
  transport: AcpTransport,
  pending: Map<JsonRpcId, (optionId: string) => void>,
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
      resolveOne(inbound.error ? "" : permissionOptionId(inbound.result));
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
