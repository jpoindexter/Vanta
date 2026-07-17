import type http from "node:http";
import { connectServer, reconnectServer, type McpConnection } from "../mcp/connect.js";
import { readMcpConfig } from "../mcp/mount.js";
import {
  appendMcpReceipt,
  readMcpRegistry,
  setMcpConnectorEnabled,
  setMcpConnectorTrust,
} from "../mcp/registry.js";
import { readJson, sendJson, type DesktopState } from "./handlers.js";

type DesktopMcpAction = "test" | "reconnect" | "enable" | "disable" | "trust" | "deny";
type McpActionRequest = { name: string; action: DesktopMcpAction };

export async function handleDesktopMcpList(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await readMcpRegistry(state.root, process.env));
}

export async function handleDesktopMcpAction(
  state: DesktopState,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJson(req) as { name?: unknown; action?: unknown };
  const parsed = parseMcpAction(body);
  if (!parsed) return sendJson(res, 400, { error: "name and a valid MCP action are required" });
  if (isPolicyAction(parsed.action)) return handlePolicyAction(state, res, parsed);
  return handleProbeAction(state, res, parsed);
}

function parseMcpAction(body: { name?: unknown; action?: unknown }): McpActionRequest | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const action = typeof body.action === "string" ? body.action as DesktopMcpAction : undefined;
  const actions: DesktopMcpAction[] = ["test", "reconnect", "enable", "disable", "trust", "deny"];
  return name && action && actions.includes(action) ? { name, action } : null;
}

function isPolicyAction(action: DesktopMcpAction): boolean {
  return action === "enable" || action === "disable" || action === "trust" || action === "deny";
}

async function handlePolicyAction(state: DesktopState, res: http.ServerResponse, request: McpActionRequest): Promise<void> {
  const { name, action } = request;
  if (action === "enable" || action === "disable") {
    await setMcpConnectorEnabled(state.root, name, action === "enable");
    await appendMcpReceipt(state.root, { action, server: name, outcome: "passed", detail: `${action}d for project` });
  } else {
    await setMcpConnectorTrust(state.root, name, action === "trust");
    await appendMcpReceipt(state.root, { action: "trust", server: name, outcome: "passed", detail: action === "trust" ? "trusted for project" : "denied for project" });
  }
  sendJson(res, 200, { connectors: await readMcpRegistry(state.root, process.env) });
}

async function handleProbeAction(state: DesktopState, res: http.ServerResponse, request: McpActionRequest): Promise<void> {
  const { name, action } = request;
  const receiptAction = action === "reconnect" ? "reconnect" : "test";
  const target = await resolveDesktopTarget(state.root, name);
  if (!target) return sendJson(res, 404, { error: "MCP connector was not found" });
  const unavailable = unavailableDesktopDetail(target.record);
  if (unavailable) {
    await appendMcpReceipt(state.root, { action: receiptAction, server: name, outcome: "failed", detail: unavailable });
    return sendJson(res, 409, { error: unavailable, connectors: target.records });
  }
  const connection = await executeDesktopProbe(state.root, name, action, target);
  await recordDesktopTest(state.root, name, action, connection);
  try { connection.client?.close(); } catch { /* already closed */ }
  await sendDesktopProbeResult(state.root, res, connection);
}

async function resolveDesktopTarget(root: string, name: string): Promise<{
  spec: import("../mcp/mount-config.js").ServerSpec;
  record: Awaited<ReturnType<typeof readMcpRegistry>>[number];
  records: Awaited<ReturnType<typeof readMcpRegistry>>;
} | null> {
  const [config, records] = await Promise.all([readMcpConfig(process.env, root), readMcpRegistry(root, process.env)]);
  const spec = config.servers[name];
  const record = records.find((item) => item.name === name);
  return spec && record ? { spec, record, records } : null;
}

function unavailableDesktopDetail(record: Awaited<ReturnType<typeof readMcpRegistry>>[number]): string | null {
  if (!record.enabled) return "disabled for this project";
  if (record.auth === "needs_auth") return "authentication required";
  return null;
}

async function executeDesktopProbe(
  root: string,
  name: string,
  action: DesktopMcpAction,
  target: NonNullable<Awaited<ReturnType<typeof resolveDesktopTarget>>>,
): Promise<McpConnection> {
  if (action === "reconnect") return reconnectServer(name, { env: process.env, cwd: root });
  return connectServer(name, target.spec, { env: process.env, root, record: target.record });
}

async function recordDesktopTest(root: string, name: string, action: DesktopMcpAction, connection: McpConnection): Promise<void> {
  if (action !== "test") return;
  const ok = connection.status === "connected";
  await appendMcpReceipt(root, {
    action: "test",
    server: name,
    outcome: ok ? "passed" : "failed",
    detail: ok ? `${connection.tools.length} tools, ${connection.resources?.length ?? 0} resources` : connection.error ?? connection.status,
  });
}

async function sendDesktopProbeResult(root: string, res: http.ServerResponse, connection: McpConnection): Promise<void> {
  const ok = connection.status === "connected";
  sendJson(res, ok ? 200 : 409, {
    result: { status: connection.status, tools: connection.tools.map((tool) => tool.name), resources: connection.resources?.map((resource) => resource.uri) ?? [], error: connection.error },
    connectors: await readMcpRegistry(root, process.env),
  });
}
