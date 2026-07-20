import type http from "node:http";
import { join } from "node:path";
import { formatGraphHandoff, graphReplayPacket, listGraphReplayPackets } from "../workflow/replay.js";
import { requestGraphRunControl } from "../workflow/run-control.js";
import { loadGraphRunState } from "../workflow/run-state-store.js";
import { readJson, sendJson, type DesktopState } from "./handlers.js";

export async function handleWorkflowRunRoute(
  state: DesktopState,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (!pathname.startsWith("/api/workflow-runs")) return false;
  const dataDir = join(state.root, ".vanta");
  const parts = pathname.split("/").filter(Boolean);
  const runId = parts[2] ? decodeURIComponent(parts[2]) : "";
  if (!runId && req.method === "GET") {
    sendJson(res, 200, await listGraphReplayPackets(dataDir));
    return true;
  }
  if (!runId) return badRequest(res, "run id is required");
  return handleKnownRun({ dataDir, runId, actionPath: parts[3], req, res });
}

async function handleKnownRun(input: { dataDir: string; runId: string; actionPath?: string; req: http.IncomingMessage; res: http.ServerResponse }): Promise<true> {
  const { dataDir, runId, actionPath, req, res } = input;
  const run = await loadGraphRunState(dataDir, runId);
  if (!run) { sendJson(res, 404, { error: `graph run not found: ${runId}` }); return true; }
  if (req.method === "GET") {
    const packet = graphReplayPacket(run);
    sendJson(res, 200, actionPath === "export" ? { handoff: formatGraphHandoff(packet) } : packet);
    return true;
  }
  if (req.method !== "POST") return badRequest(res, "method not allowed");
  const body = await readJson(req) as { action?: unknown };
  if (body.action !== "pause" && body.action !== "cancel" && body.action !== "retry") {
    return badRequest(res, "action must be pause, cancel, or retry");
  }
  const updated = await requestGraphRunControl(dataDir, runId, body.action);
  sendJson(res, 200, graphReplayPacket(updated));
  return true;
}

function badRequest(res: http.ServerResponse, error: string): true {
  sendJson(res, 400, { error });
  return true;
}
