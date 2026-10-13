import type http from "node:http";
import type { DesktopState } from "./handlers.js";
import {
  readJson, sendJson,
  handleStatus, handleSessions, handleNewSession, handleOpenSession,
  handleRenameSession, handleArchiveSession, handleDeleteSession, handleBulkSessions, handlePinSession, handleReorderPinnedSessions,
  handleTools, handleCapabilities, handleMessaging, handleArtifacts, handleSaveMessaging,
  handleFiles, handleFileContext, handleCanvas, handleModels, handleSetModel, handleModelSettings,
  handleApproval, handleTerminal, handleChat, handleStopChat, handleQueueChat, handleQueueList,
  handleAccessMode,
  handleRuntime,
  handleConnectTest,
  handleTelegramSetupStatus,
  handleGatewayStart,
  handleSessionDraft,
  handleRuns,
  handleRunAction,
} from "./handlers.js";
import { attachSse, type SseClients } from "./session-state.js";
import { getWakeApi, setWakeApi } from "./wake-api.js";
import { handleDesktopSetup } from "./setup.js";
import { handleDesktopMcpAction, handleDesktopMcpList } from "./mcp-connectors.js";
import { handleIntegrationAction, handleIntegrationList } from "./integration-connectors.js";
import { handleRuntimeProfiles } from "./runtime-profile-api.js";
import { handleModelDownloads } from "./model-download-api.js";
import { handleGoogleConnectAction, handleGoogleConnectStatus } from "./google-connect.js";
import { handleDesktopReleaseProofs } from "./release-proofs.js";
import { handleDesktopLookCapture } from "./look-capture-api.js";
import { handleWorkflowRunRoute } from "./workflow-run-api.js";
import { handleDesktopSchedules } from "./schedule-api.js";
import { handleControlRoute } from "./control-routes.js";
import { handleDesktopContinuity } from "./continuity-api.js";
import { handleFilePreview } from "./file-preview.js";
import { handleDesktopVoiceStatus, handleDesktopVoiceTranscribe } from "./voice-api.js";

export type RouteCtx = { req: http.IncomingMessage; res: http.ServerResponse; state: DesktopState; sid: string; sseClients: SseClients; pathname: string };
async function routeGet(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  if (p === "/api/events") { attachSse(sseClients, sid, res); return true; }
  if (p.startsWith("/api/models/")) {
    const providerId = decodeURIComponent(p.slice("/api/models/".length));
    await handleModels(state, res, providerId);
    return true;
  }
  const handler: Record<string, () => Promise<void>> = {
    "/api/status": () => handleStatus(state, res),
    "/api/voice": () => handleDesktopVoiceStatus(res),
    "/api/sessions": () => handleSessions(res),
    "/api/runs": () => handleRuns(state, req, res),
    "/api/schedules": () => handleDesktopSchedules(state, res),
    "/api/continuity": () => handleDesktopContinuity(state, req, res),
    "/api/tools": () => handleTools(state, res),
    "/api/capabilities": () => handleCapabilities(state, res),
    "/api/messaging": () => handleMessaging(res),
    "/api/artifacts": () => handleArtifacts(state, res),
    "/api/files": () => handleFiles(state, res),
    "/api/file-context": () => handleFileContext(state, res),
    "/api/file-preview": () => handleFilePreview(state.root, req, res),
    "/api/canvas": () => handleCanvas(state, res),
    "/api/models": () => handleModels(state, res),
    "/api/setup": () => handleDesktopSetup(state, req, res),
    "/api/setup/messaging/telegram": () => handleTelegramSetupStatus(state, res),
    "/api/approval": () => handleApproval(state, req, res),
    "/api/access-mode": () => handleAccessMode(state, req, res),
    "/api/runtime": () => handleRuntime(state, req, res),
    "/api/runtime/profiles": () => handleRuntimeProfiles(state, req, res),
    "/api/runtime/downloads": () => handleModelDownloads(state, req, res),
    "/api/chat/queue": () => handleQueueList(state, res),
    "/api/connect/mcp": () => handleDesktopMcpList(state, res),
    "/api/connect/integrations": () => handleIntegrationList(state, res),
    "/api/connect/google": () => handleGoogleConnectStatus(res),
    "/api/release-proofs": () => handleDesktopReleaseProofs(state.root, res),
    "/api/wake": async () => sendJson(res, 200, await getWakeApi()),
  };
  if (handler[p]) { await handler[p](); return true; }
  return false;
}

async function routePost(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  const handlers: Record<string, () => Promise<void>> = {
    "/api/sessions/new": () => handleNewSession(state, res),
    "/api/sessions/open": () => handleOpenSession(state, req, res),
    "/api/sessions/rename": () => handleRenameSession(req, res),
    "/api/sessions/archive": () => handleArchiveSession(req, res),
    "/api/sessions/delete": () => handleDeleteSession(state, req, res),
    "/api/sessions/bulk": () => handleBulkSessions(state, req, res),
    "/api/sessions/pin": () => handlePinSession(req, res),
    "/api/sessions/reorder-pins": () => handleReorderPinnedSessions(req, res),
    "/api/sessions/draft": () => handleSessionDraft(state, req, res),
    "/api/runs": () => handleRunAction(state, req, res),
    "/api/continuity": () => handleDesktopContinuity(state, req, res),
    "/api/model": () => handleSetModel(state, req, res),
    "/api/model-settings": () => handleModelSettings(state, req, res),
    "/api/messaging": () => handleSaveMessaging(state, req, res),
    "/api/setup": () => handleDesktopSetup(state, req, res),
    "/api/approval": () => handleApproval(state, req, res),
    "/api/access-mode": () => handleAccessMode(state, req, res),
    "/api/connect/test": () => handleConnectTest(state, req, res),
    "/api/gateway/start": () => handleGatewayStart(state, res),
    "/api/connect/mcp": () => handleDesktopMcpAction(state, req, res),
    "/api/connect/integrations": () => handleIntegrationAction(state, req, res),
    "/api/connect/google": () => handleGoogleConnectAction(req, res),
    "/api/runtime": () => handleRuntime(state, req, res),
    "/api/runtime/profiles": () => handleRuntimeProfiles(state, req, res),
    "/api/runtime/downloads": () => handleModelDownloads(state, req, res),
    "/api/terminal": () => handleTerminal(state, req, res),
    "/api/chat/stop": () => handleStopChat(state, res),
    "/api/chat/queue": () => handleQueueChat(state, req, res),
    "/api/look": () => handleDesktopLookCapture(state, req, res),
    "/api/voice/transcribe": () => handleDesktopVoiceTranscribe(req, res),
  };
  if (handlers[p]) { await handlers[p](); return true; }
  if (p === "/api/wake") {
    const body = await readJson(req) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") sendJson(res, 400, { error: "enabled must be boolean" });
    else sendJson(res, 200, await setWakeApi(state.root, body.enabled));
    return true;
  }
  if (p === "/api/chat") {
    state._sseSessionId = sid; state._sseClients = sseClients;
    await handleChat(state, req, res); return true;
  }
  return false;
}

export async function routeByMethod(ctx: RouteCtx): Promise<boolean> {
  if (await handleWorkflowRunRoute(ctx.state, ctx.req, ctx.res, ctx.pathname)) return true;
  if (await handleControlRoute(ctx)) return true;
  if (ctx.req.method === "GET") return routeGet(ctx);
  if (ctx.req.method === "POST") return routePost(ctx);
  return false;
}
