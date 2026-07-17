import type http from "node:http";
import { connectServer, reconnectServer, type McpConnection } from "../mcp/connect.js";
import { readMcpConfig } from "../mcp/mount.js";
import {
  appendMcpReceipt,
  readMcpRegistry,
  setMcpConnectorEnabled,
  setMcpConnectorTrust,
} from "../mcp/registry.js";
import {
  authorizeDesktopMcp,
  desktopMcpPayload,
  importClaudeDesktopMcp,
  installDesktopMcp,
  readDesktopMcpResource,
  removeDesktopMcp,
} from "./mcp-control.js";
import { readJson, sendJson, type DesktopState } from "./handlers.js";

type DesktopMcpAction = "test" | "reconnect" | "enable" | "disable" | "trust" | "deny" | "install" | "import_desktop" | "remove" | "auth" | "read_resource";
type McpActionRequest = { name?: string; action: DesktopMcpAction; uri?: string; withTools: string[] };

export async function handleDesktopMcpList(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await desktopMcpPayload(state.root));
}

export async function handleDesktopMcpAction(
  state: DesktopState,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJson(req) as { name?: unknown; action?: unknown; uri?: unknown; withTools?: unknown };
  const parsed = parseMcpAction(body);
  if (!parsed) return sendJson(res, 400, { error: "a valid MCP action and its required fields are required" });
  try {
    const result = await handleLifecycleAction(state.root, parsed);
    if (result) return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 409, { error: error instanceof Error ? error.message : String(error), ...(await desktopMcpPayload(state.root)) });
  }
  if (isPolicyAction(parsed.action)) return handlePolicyAction(state, res, parsed);
  return handleProbeAction(state, res, parsed);
}

function parseMcpAction(body: { name?: unknown; action?: unknown; uri?: unknown; withTools?: unknown }): McpActionRequest | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const action = typeof body.action === "string" ? body.action as DesktopMcpAction : undefined;
  const actions: DesktopMcpAction[] = ["test", "reconnect", "enable", "disable", "trust", "deny", "install", "import_desktop", "remove", "auth", "read_resource"];
  if (!action || !actions.includes(action)) return null;
  if (action !== "import_desktop" && !name) return null;
  const uri = typeof body.uri === "string" ? body.uri.trim() : undefined;
  if (action === "read_resource" && !uri) return null;
  const withTools = Array.isArray(body.withTools) ? body.withTools.filter((item): item is string => typeof item === "string") : [];
  return { ...(name ? { name } : {}), action, ...(uri ? { uri } : {}), withTools };
}

async function handleLifecycleAction(root: string, request: McpActionRequest): Promise<unknown | null> {
  if (request.action === "install") return installDesktopMcp(root, request.name!, request.withTools);
  if (request.action === "import_desktop") return importClaudeDesktopMcp(root);
  if (request.action === "remove") return removeDesktopMcp(root, request.name!);
  if (request.action === "auth") return authorizeDesktopMcp(root, request.name!);
  if (request.action === "read_resource") return readDesktopMcpResource(root, request.name!, request.uri!);
  return null;
}

function isPolicyAction(action: DesktopMcpAction): boolean {
  return action === "enable" || action === "disable" || action === "trust" || action === "deny";
}

async function handlePolicyAction(state: DesktopState, res: http.ServerResponse, request: McpActionRequest): Promise<void> {
  const { action } = request;
  const name = request.name!;
  if (action === "enable" || action === "disable") {
    await setMcpConnectorEnabled(state.root, name, action === "enable");
    await appendMcpReceipt(state.root, { action, server: name, outcome: "passed", detail: `${action}d for project` });
  } else {
    await setMcpConnectorTrust(state.root, name, action === "trust");
    await appendMcpReceipt(state.root, { action: "trust", server: name, outcome: "passed", detail: action === "trust" ? "trusted for project" : "denied for project" });
  }
  sendJson(res, 200, await desktopMcpPayload(state.root));
}

async function handleProbeAction(state: DesktopState, res: http.ServerResponse, request: McpActionRequest): Promise<void> {
  const { action } = request;
  const name = request.name!;
  const receiptAction = action === "reconnect" ? "reconnect" : "test";
  const target = await resolveDesktopTarget(state.root, name);
  if (!target) return sendJson(res, 404, { error: "MCP connector was not found" });
  const unavailable = unavailableDesktopDetail(target.record);
  if (unavailable) {
    await appendMcpReceipt(state.root, { action: receiptAction, server: name, outcome: "failed", detail: unavailable });
    return sendJson(res, 409, { error: unavailable, ...(await desktopMcpPayload(state.root)) });
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
    ...(await desktopMcpPayload(root)),
  });
}
