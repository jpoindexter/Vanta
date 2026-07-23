import { hasGoogleAuth } from "../google/auth.js";
import { MESSAGING_CATALOG, messagingPlatformById, platformAvailability } from "../gateway/platforms/registry.js";
import { readMcpRegistry, type McpConnectorRecord } from "../mcp/registry.js";
import { latestIntegrationReceipt, readIntegrationReceipts } from "./receipts.js";
import type { IntegrationId, IntegrationReceipt, IntegrationRecord, IntegrationState } from "./types.js";

type CatalogDeps = {
  googleAuthorized?: (env: NodeJS.ProcessEnv) => Promise<boolean>;
  mcpRecords?: (root: string, env: NodeJS.ProcessEnv) => Promise<McpConnectorRecord[]>;
  receipts?: typeof readIntegrationReceipts;
};

const LABELS: Record<IntegrationId, string> = {
  trello: "Trello", dropbox: "Dropbox", box: "Box", "google-drive": "Google Drive",
  "atlassian-rovo": "Atlassian Rovo", slack: "Slack", telegram: "Telegram",
};

function credentialState(env: NodeJS.ProcessEnv, names: string[]): IntegrationState {
  return names.every((name) => env[name]?.trim()) ? "installed" : "needs_setup";
}

function testedState(configured: boolean, receipt?: IntegrationReceipt): IntegrationState {
  if (!configured) return "needs_setup";
  if (receipt?.action === "test") return receipt.outcome === "passed" ? "ready" : "degraded";
  return "installed";
}

function messagingRecord(id: "slack" | "telegram", env: NodeJS.ProcessEnv, receipt?: IntegrationReceipt): Omit<IntegrationRecord, "receipt"> {
  const platform = messagingPlatformById(id);
  const availability = platform ? platformAvailability(platform, env) : null;
  const configured = Boolean(platform?.implemented && availability?.configured);
  const state = testedState(configured, receipt);
  return {
    id, label: LABELS[id], kind: "native", state: platform?.implemented ? state : "unavailable",
    detail: state === "ready" ? "Configured gateway adapter verified." : configured ? "Credentials are saved; run a bounded connection test." : platform?.implemented ? "Credentials are not configured." : "Not included in this Vanta build.",
    actions: configured ? ["test", "configure"] : platform?.implemented ? ["configure"] : [],
  };
}

function packRecord(id: "box" | "atlassian-rovo", name: string, records: readonly McpConnectorRecord[]): Omit<IntegrationRecord, "receipt"> {
  const record = records.find((item) => item.name === name);
  if (!record) return { id, label: LABELS[id], kind: "connector_pack", state: "installable", detail: "Official hosted MCP connector pack is available but not installed.", actions: ["install"] };
  if (record.auth === "needs_auth") return { id, label: LABELS[id], kind: "connector_pack", state: "installed", detail: "Installed; authorization is required before tools can mount.", actions: ["configure", "manage_mcp"] };
  if (record.health === "ready") return { id, label: LABELS[id], kind: "connector_pack", state: "ready", detail: "Installed, authenticated, and recently verified.", actions: ["test", "manage_mcp"] };
  return { id, label: LABELS[id], kind: "connector_pack", state: "degraded", detail: record.lastError ?? "Installed but has not passed a connection test.", actions: ["test", "manage_mcp"] };
}

function directRecord(id: "trello" | "dropbox", env: NodeJS.ProcessEnv, receipt?: IntegrationReceipt): Omit<IntegrationRecord, "receipt"> {
  const names = id === "trello" ? ["VANTA_TRELLO_KEY", "VANTA_TRELLO_TOKEN"] : ["VANTA_DROPBOX_TOKEN"];
  const state = testedState(credentialState(env, names) === "installed", receipt);
  return {
    id, label: LABELS[id], kind: "native", state,
    detail: state === "ready" ? "Read credentials are verified; writes require a separate write credential." : state === "degraded" ? "The last connection test failed; reauthorize and retry." : state === "installed" ? "Read credentials are saved locally; run a bounded connection test." : `Set ${names.join(" and ")} to connect.`,
    actions: state === "needs_setup" ? ["configure"] : ["test", "configure"],
  };
}

export async function readIntegrationCatalog(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: CatalogDeps = {},
): Promise<IntegrationRecord[]> {
  const [google, mcp, receipts] = await Promise.all([
    (deps.googleAuthorized ?? hasGoogleAuth)(env),
    (deps.mcpRecords ?? readMcpRegistry)(root, env),
    (deps.receipts ?? readIntegrationReceipts)(root),
  ]);
  const receipt = (id: IntegrationId) => latestIntegrationReceipt(receipts, id);
  const values: Omit<IntegrationRecord, "receipt">[] = [
    directRecord("trello", env, receipt("trello")),
    directRecord("dropbox", env, receipt("dropbox")),
    packRecord("box", "box-remote-mcp", mcp),
    { id: "google-drive", label: LABELS["google-drive"], kind: "native", state: testedState(google, receipt("google-drive")), detail: receipt("google-drive")?.action === "test" && receipt("google-drive")?.outcome === "failed" ? "The last Google Drive test failed; reconnect Workspace before retrying." : google ? "Google OAuth is saved; run a bounded Drive test." : "Complete Google Workspace consent before Drive tools are available.", actions: google ? ["test", "configure"] : ["configure"] },
    packRecord("atlassian-rovo", "atlassian-rovo-mcp", mcp),
    messagingRecord("slack", env, receipt("slack")),
    messagingRecord("telegram", env, receipt("telegram")),
  ];
  return values.map((value) => ({ ...value, receipt: receipt(value.id) }));
}

export function integrationStateLabel(state: IntegrationState): string {
  return ({ ready: "Ready", needs_setup: "Needs setup", installable: "Install available", installed: "Installed", degraded: "Needs attention", unavailable: "Unavailable" })[state];
}

export const INTEGRATION_IDS: readonly IntegrationId[] = ["trello", "dropbox", "box", "google-drive", "atlassian-rovo", "slack", "telegram"];
