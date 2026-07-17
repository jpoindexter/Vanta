import { MCP_CATALOG } from "../mcp/catalog.js";
import { deleteMcpToken } from "../mcp/auth-store.js";
import { startMcpAuth } from "../mcp/auth-flow.js";
import { installCatalogMcp, removeStoredMcp } from "../mcp/config-store.js";
import { connectServer } from "../mcp/connect.js";
import { importDesktopMcp } from "../mcp/desktop-import.js";
import { readMcpConfig } from "../mcp/mount.js";
import { extractAuthConfig } from "../mcp/mount-config.js";
import {
  appendMcpReceipt,
  readMcpReceipts,
  readMcpRegistry,
} from "../mcp/registry.js";

export async function desktopMcpPayload(root: string) {
  const [connectors, receipts] = await Promise.all([
    readMcpRegistry(root, process.env),
    readMcpReceipts(root),
  ]);
  const installed = new Set(connectors.map((record) => record.name));
  return {
    connectors,
    catalog: MCP_CATALOG.map((entry) => ({ ...entry, installed: installed.has(entry.name) })),
    receipts: receipts.slice(-50).reverse(),
  };
}

export async function installDesktopMcp(root: string, name: string, withTools: string[]) {
  const result = await installCatalogMcp(name, withTools, process.env);
  await appendMcpReceipt(root, {
    action: "install",
    server: name,
    outcome: result.ok ? "passed" : "failed",
    detail: result.ok ? result.detail : result.error,
  });
  if (!result.ok) throw new Error(result.error);
  return { ...(await desktopMcpPayload(root)), message: `Installed ${name}. Review trust before testing.` };
}

export async function importClaudeDesktopMcp(root: string) {
  const result = await importDesktopMcp({ env: process.env });
  await appendMcpReceipt(root, {
    action: "import",
    outcome: result.ok ? "passed" : "failed",
    detail: result.ok ? `imported ${result.imported.length}, skipped ${result.skipped.length}` : result.error,
  });
  if (!result.ok) throw new Error(result.error);
  return {
    ...(await desktopMcpPayload(root)),
    message: `Imported ${result.imported.length}; skipped ${result.skipped.length}.`,
  };
}

export async function removeDesktopMcp(root: string, name: string) {
  const result = await removeStoredMcp(root, name, process.env);
  await appendMcpReceipt(root, {
    action: "remove",
    server: name,
    outcome: result.ok ? "passed" : "failed",
    detail: result.ok ? result.detail : result.error,
  });
  if (!result.ok) throw new Error(result.error);
  await deleteMcpToken(name, process.env);
  return { ...(await desktopMcpPayload(root)), message: `Removed ${name}.` };
}

export async function authorizeDesktopMcp(root: string, name: string) {
  const config = await readMcpConfig(process.env, root);
  const auth = config.servers[name] ? extractAuthConfig(config.servers[name]!) : null;
  if (!auth) throw new Error("connector does not declare a complete OAuth configuration");
  const started = await startMcpAuth(name, auth, process.env);
  if (!started.ok) throw new Error(started.error);
  await appendMcpReceipt(root, {
    action: "auth",
    server: name,
    outcome: "passed",
    detail: "authorization flow opened; token remains private",
  });
  return { ...(await desktopMcpPayload(root)), authUrl: started.authUrl, message: `Authorize ${name} in your browser, then reconnect.` };
}

export async function readDesktopMcpResource(root: string, name: string, uri: string) {
  const [config, records] = await Promise.all([
    readMcpConfig(process.env, root),
    readMcpRegistry(root, process.env),
  ]);
  const spec = config.servers[name];
  const record = records.find((item) => item.name === name);
  assertReadableConnector(spec, record);
  const connection = await connectServer(name, spec, { env: process.env, root, record });
  try {
    const client = readableClient(connection, uri);
    const value = await client.readResource(uri);
    const preview = resourcePreview(value);
    await appendMcpReceipt(root, { action: "resource", server: name, outcome: "passed", detail: `read ${uri}` });
    return { ...(await desktopMcpPayload(root)), resource: { uri, preview }, message: `Read ${uri}.` };
  } catch (error) {
    await appendMcpReceipt(root, { action: "resource", server: name, outcome: "failed", detail: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    try { connection.client?.close(); } catch { /* connection already closed */ }
  }
}

function assertReadableConnector(
  spec: Awaited<ReturnType<typeof readMcpConfig>>["servers"][string] | undefined,
  record: Awaited<ReturnType<typeof readMcpRegistry>>[number] | undefined,
): asserts spec is NonNullable<typeof spec> {
  if (!spec || !record) throw new Error("MCP connector was not found");
  if (!record.enabled || record.trust !== "trusted" || record.auth === "needs_auth") {
    throw new Error("connector must be enabled, trusted, and authenticated before reading resources");
  }
}

function readableClient(connection: Awaited<ReturnType<typeof connectServer>>, uri: string) {
  if (connection.status !== "connected" || !connection.client) throw new Error(connection.error ?? "connector did not connect");
  if (!(connection.resources ?? []).some((resource) => resource.uri === uri)) throw new Error("resource is not advertised by this connector");
  return connection.client;
}

function resourcePreview(value: unknown): string {
  let text: string;
  try { text = typeof value === "string" ? value : JSON.stringify(value, null, 2); }
  catch { text = String(value); }
  return text.length > 20_000 ? `${text.slice(0, 20_000)}\n… preview truncated` : text;
}
