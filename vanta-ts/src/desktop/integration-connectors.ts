import type http from "node:http";
import { readIntegrationCatalog } from "../integrations/catalog.js";
import { executeIntegrationAction } from "../integrations/actions.js";
import type { IntegrationAction, IntegrationId } from "../integrations/types.js";
import { readJson, sendJson, type DesktopState } from "./handlers.js";

type Request = { id: IntegrationId; action: IntegrationAction };

const IDS: IntegrationId[] = ["trello", "dropbox", "box", "google-drive", "atlassian-rovo", "slack", "telegram"];
const ACTIONS: IntegrationAction[] = ["test", "install", "configure", "manage_mcp"];

export async function handleIntegrationList(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await readIntegrationCatalog(state.root));
}

export async function handleIntegrationAction(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const parsed = parseRequest(await readJson(req));
  if (!parsed) return sendJson(res, 400, { error: "a valid integration id and action are required" });
  try {
    const message = await executeIntegrationAction(state.root, parsed.id, parsed.action);
    sendJson(res, 200, { integrations: await readIntegrationCatalog(state.root), message });
  } catch (error) {
    sendJson(res, 409, { error: error instanceof Error ? error.message : String(error), integrations: await readIntegrationCatalog(state.root) });
  }
}

function parseRequest(body: unknown): Request | null {
  if (!body || typeof body !== "object") return null;
  const { id, action } = body as { id?: unknown; action?: unknown };
  return typeof id === "string" && IDS.includes(id as IntegrationId) && typeof action === "string" && ACTIONS.includes(action as IntegrationAction)
    ? { id: id as IntegrationId, action: action as IntegrationAction }
    : null;
}
