import { z } from "zod";

// ACP (Agent Client Protocol) — PURE JSON-RPC 2.0 framing/codec + the method
// param schemas as zod. No I/O, no transport: parse/serialize messages and the
// request-id correlator live here so acp-server.ts only wires them to a stream.
// Mirrors the dependency-free JSON-RPC pattern in mcp/client.ts (no SDK dep).

export const PROTOCOL_VERSION = 1;
export const AGENT_NAME = "vanta";
export const AGENT_VERSION = "0.1.0";

export type JsonRpcId = number | string;

/** A JSON-RPC 2.0 request (has an id; expects a response). */
export type JsonRpcRequest = { jsonrpc: "2.0"; id: JsonRpcId; method: string; params?: unknown };
/** A JSON-RPC 2.0 notification (no id; no response). */
export type JsonRpcNotification = { jsonrpc: "2.0"; method: string; params?: unknown };
/** A JSON-RPC 2.0 success response. */
export type JsonRpcSuccess = { jsonrpc: "2.0"; id: JsonRpcId; result: unknown };
/** A JSON-RPC 2.0 error response. */
export type JsonRpcError = { jsonrpc: "2.0"; id: JsonRpcId | null; error: RpcErrorBody };
export type RpcErrorBody = { code: number; message: string; data?: unknown };

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcSuccess | JsonRpcError;

/** Standard JSON-RPC 2.0 error codes (the subset ACP servers use). */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** A parsed inbound message, classified. `parse_error` carries a transport fault. */
export type Inbound =
  | { kind: "request"; id: JsonRpcId; method: string; params: unknown }
  | { kind: "notification"; method: string; params: unknown }
  | { kind: "response"; id: JsonRpcId; result?: unknown; error?: RpcErrorBody }
  | { kind: "parse_error"; reason: string; id: JsonRpcId | null };

/**
 * Parse one raw JSON-RPC line into a classified Inbound. NEVER throws — a
 * malformed line returns `parse_error` so the caller can emit a proper error
 * response (errors-as-values at the protocol boundary).
 */
export function parseMessage(line: string): Inbound {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { kind: "parse_error", reason: "invalid JSON", id: null };
  }
  if (!msg || typeof msg !== "object") {
    return { kind: "parse_error", reason: "not a JSON-RPC object", id: null };
  }
  const id = msg.id as JsonRpcId | null | undefined;
  if ("result" in msg || "error" in msg) {
    return { kind: "response", id: (id ?? 0) as JsonRpcId, result: msg.result, error: msg.error as RpcErrorBody | undefined };
  }
  return classifyCall(msg, id);
}

/** Classify a non-response message (a request or notification) by id presence. */
function classifyCall(msg: Record<string, unknown>, id: JsonRpcId | null | undefined): Inbound {
  if (typeof msg.method !== "string") {
    return { kind: "parse_error", reason: "missing method", id: id ?? null };
  }
  if (id === undefined || id === null) {
    return { kind: "notification", method: msg.method, params: msg.params };
  }
  return { kind: "request", id, method: msg.method, params: msg.params };
}

/** Serialize a success response to a single newline-framed line. */
export function serializeResult(id: JsonRpcId, result: unknown): string {
  return `${JSON.stringify({ jsonrpc: "2.0", id, result } satisfies JsonRpcSuccess)}\n`;
}

/** Serialize an error response. `id` may be null when the request id is unknown. */
export function serializeError(id: JsonRpcId | null, code: number, message: string, data?: unknown): string {
  const error: RpcErrorBody = data === undefined ? { code, message } : { code, message, data };
  return `${JSON.stringify({ jsonrpc: "2.0", id, error } satisfies JsonRpcError)}\n`;
}

/** Serialize an outbound notification (no id). */
export function serializeNotification(method: string, params?: unknown): string {
  return `${JSON.stringify({ jsonrpc: "2.0", method, params } satisfies JsonRpcNotification)}\n`;
}

/** Serialize an outbound request (used for agent→client `session/request_permission`). */
export function serializeRequest(id: JsonRpcId, method: string, params?: unknown): string {
  return `${JSON.stringify({ jsonrpc: "2.0", id, method, params } satisfies JsonRpcRequest)}\n`;
}

// ── ACP method/param zod schemas (the boundary; LLM/editor input is untrusted) ──

/** A `text` content block — the only block kind Vanta consumes from a prompt. */
export const TextContentBlock = z.object({ type: z.literal("text"), text: z.string() });
/** Any content block; non-text blocks are accepted but ignored when flattening. */
export const ContentBlock = z.union([TextContentBlock, z.object({ type: z.string() }).passthrough()]);

export const InitializeParams = z.object({
  protocolVersion: z.number().default(PROTOCOL_VERSION),
  clientCapabilities: z.record(z.unknown()).optional(),
  clientInfo: z.object({ name: z.string(), version: z.string().optional() }).nullish(),
});

export const NewSessionParams = z.object({
  cwd: z.string().optional(),
  mcpServers: z.array(z.unknown()).optional(),
  additionalDirectories: z.array(z.string()).optional(),
});

export const LoadSessionParams = z.object({
  sessionId: z.string(),
  cwd: z.string().optional(),
  mcpServers: z.array(z.unknown()).optional(),
});

export const PromptParams = z.object({
  sessionId: z.string(),
  prompt: z.array(ContentBlock).default([]),
});

export const CancelParams = z.object({ sessionId: z.string() });
export const SetModeParams = z.object({ sessionId: z.string(), modeId: z.string() });
export const SetModelParams = z.object({ sessionId: z.string(), modelId: z.string() });

/** Flatten an ACP prompt's content blocks into the plain user text Vanta runs. */
export function promptText(blocks: z.infer<typeof PromptParams>["prompt"]): string {
  return blocks
    .map((b) => (b.type === "text" && "text" in b ? String((b as { text: unknown }).text) : ""))
    .filter(Boolean)
    .join("\n");
}
