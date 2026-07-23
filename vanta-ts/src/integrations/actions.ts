import { installCatalogMcp } from "../mcp/config-store.js";
import { connectServer } from "../mcp/connect.js";
import { readMcpConfig } from "../mcp/mount.js";
import { appendMcpReceipt, readMcpRegistry } from "../mcp/registry.js";
import { probeMessaging } from "../setup/assistant.js";
import { listDropbox } from "./dropbox.js";
import { testGoogleDrive } from "./google-drive.js";
import { appendIntegrationReceipt } from "./receipts.js";
import { testSlack } from "./slack.js";
import { listTrelloBoards } from "./trello.js";
import type { IntegrationAction, IntegrationId } from "./types.js";

export async function executeIntegrationAction(
  root: string,
  id: IntegrationId,
  action: IntegrationAction,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  try {
    const message = action === "install" ? await installPack(root, id, env)
      : action === "test" ? await testIntegration(root, id, env)
        : action === "manage_mcp" ? "Use the MCP panel to inspect, trust, authorize, and manage this connector." : configurationHint(id);
    if (action === "install" || action === "test") await appendIntegrationReceipt(root, { integration: id, action, outcome: "passed", detail: message });
    return message;
  } catch (error) {
    if (action === "install" || action === "test") await appendIntegrationReceipt(root, { integration: id, action, outcome: "failed", detail: errorMessage(error) });
    throw error;
  }
}

async function installPack(root: string, id: IntegrationId, env: NodeJS.ProcessEnv): Promise<string> {
  const name = packName(id);
  if (!name) throw new Error("this integration does not have an installable MCP pack");
  const result = await installCatalogMcp(name, [], env);
  await appendMcpReceipt(root, { action: "install", server: name, outcome: result.ok ? "passed" : "failed", detail: result.ok ? result.detail : result.error });
  if (!result.ok) throw new Error(result.error);
  return `Installed ${name}. Authorize and test it before mounting tools.`;
}

async function testIntegration(root: string, id: IntegrationId, env: NodeJS.ProcessEnv): Promise<string> {
  if (id === "trello") await listTrelloBoards(env);
  else if (id === "dropbox") await listDropbox("", env);
  else if (id === "google-drive") await testGoogleDrive(env);
  else if (id === "slack") await testSlack(env);
  else if (id === "telegram") await testTelegram(env);
  else await testMcpPack(root, id, env);
  return `${label(id)} connection test passed.`;
}

async function testTelegram(env: NodeJS.ProcessEnv): Promise<void> {
  const result = await probeMessaging(env);
  if (!result.ok) throw new Error(`Telegram verification failed: ${result.detail}`);
}

async function testMcpPack(root: string, id: IntegrationId, env: NodeJS.ProcessEnv): Promise<void> {
  const name = packName(id);
  if (!name) throw new Error("this integration does not have an MCP connector pack");
  const [config, records] = await Promise.all([readMcpConfig(env, root), readMcpRegistry(root, env)]);
  const record = records.find((item) => item.name === name);
  const spec = config.servers[name];
  if (!record || !spec) throw new Error(`${label(id)} is not installed.`);
  if (!record.enabled || record.trust !== "trusted") throw new Error(`${label(id)} must be enabled and trusted before testing.`);
  if (record.auth === "needs_auth") throw new Error(`${label(id)} authorization is required before testing.`);
  const connection = await connectServer(name, spec, { env, root, record });
  try {
    if (connection.status !== "connected") throw new Error(connection.error ?? `${label(id)} did not connect.`);
  } finally { try { connection.client?.close(); } catch { /* already closed */ } }
}

function packName(id: IntegrationId): string | null {
  return id === "box" ? "box-remote-mcp" : id === "atlassian-rovo" ? "atlassian-rovo-mcp" : null;
}

function configurationHint(id: IntegrationId): string {
  return ({
    trello: "Set VANTA_TRELLO_KEY and VANTA_TRELLO_TOKEN, then test the connection.",
    dropbox: "Set VANTA_DROPBOX_TOKEN, then test the connection.",
    box: "Authorize Box in the MCP panel.", "google-drive": "Open Google to complete Workspace consent.",
    "atlassian-rovo": "Authorize Atlassian Rovo in the MCP panel.", slack: "Open Messaging to configure Slack.", telegram: "Open Messaging to configure Telegram.",
  })[id];
}

function label(id: IntegrationId): string {
  return ({ trello: "Trello", dropbox: "Dropbox", box: "Box", "google-drive": "Google Drive", "atlassian-rovo": "Atlassian Rovo", slack: "Slack", telegram: "Telegram" })[id];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
