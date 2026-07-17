import http from "node:http";
import type { DesktopState, DesktopEvent } from "./handlers.js";
import {
  eventLabel, readJson, sendJson,
  handleStatus, handleSessions, handleNewSession, handleOpenSession,
  handleRenameSession, handleArchiveSession, handleDeleteSession,
  handleTools, handleCapabilities, handleMessaging, handleArtifacts, handleSaveMessaging,
  handleFiles, handleFileContext, handleCanvas, handleModels, handleSetModel,
  handleApproval, handleTerminal, handleChat, handleStopChat, handleQueueChat,
  handleAccessMode,
  handleRuntime,
  handleConnectTest,
} from "./handlers.js";
export { approvalDecision, type PendingApproval, type DesktopEvent, type DesktopState, eventLabel } from "./handlers.js";
import {
  getSession, attachSse, sessionIdFromRequest,
  type SessionMap, type SseClients,
} from "./session-state.js";
import { writeDesktopAsset } from "./assets.js";
import { handleCompanionRoute, isLoopbackRequest, type CompanionRouteOptions } from "../companion/routes.js";
import { handlePublicApiProbeRoute, handlePublicApiRoute, type PublicApiRouteOptions } from "../public-api/routes.js";
import type { ReadinessDeps } from "../public-api/readiness.js";
import { resolveVantaHome } from "../store/home.js";
import { getWakeApi, setWakeApi } from "./wake-api.js";
import { handleDesktopSetup } from "./setup.js";
import { ensureDesktopPermissionMode } from "./permission-mode.js";
import { handleDesktopMcpAction, handleDesktopMcpList } from "./mcp-connectors.js";

type RouteCtx = { req: http.IncomingMessage; res: http.ServerResponse; state: DesktopState; sid: string; sseClients: SseClients; pathname: string };

async function routeGet(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  if (await writeDesktopAsset(state.root, p, res)) return true;
  if (p === "/api/events") { attachSse(sseClients, sid, res); return true; }
  if (p.startsWith("/api/models/")) {
    const providerId = decodeURIComponent(p.slice("/api/models/".length));
    await handleModels(res, providerId);
    return true;
  }
  const handler: Record<string, () => Promise<void>> = {
    "/api/status": () => handleStatus(state, res),
    "/api/sessions": () => handleSessions(res),
    "/api/tools": () => handleTools(state, res),
    "/api/capabilities": () => handleCapabilities(state, res),
    "/api/messaging": () => handleMessaging(res),
    "/api/artifacts": () => handleArtifacts(state, res),
    "/api/files": () => handleFiles(state, res),
    "/api/file-context": () => handleFileContext(state, res),
    "/api/canvas": () => handleCanvas(state, res),
    "/api/models": () => handleModels(res),
    "/api/setup": () => handleDesktopSetup(state, req, res),
    "/api/approval": () => handleApproval(state, req, res),
    "/api/access-mode": () => handleAccessMode(state, req, res),
    "/api/runtime": () => handleRuntime(state, req, res),
    "/api/connect/mcp": () => handleDesktopMcpList(state, res),
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
    "/api/model": () => handleSetModel(state, req, res),
    "/api/messaging": () => handleSaveMessaging(state, req, res),
    "/api/setup": () => handleDesktopSetup(state, req, res),
    "/api/approval": () => handleApproval(state, req, res),
    "/api/access-mode": () => handleAccessMode(state, req, res),
    "/api/connect/test": () => handleConnectTest(state, req, res),
    "/api/connect/mcp": () => handleDesktopMcpAction(state, req, res),
    "/api/runtime": () => handleRuntime(state, req, res),
    "/api/terminal": () => handleTerminal(state, req, res),
    "/api/chat/stop": () => handleStopChat(state, res),
    "/api/chat/queue": () => handleQueueChat(state, req, res),
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

type ServerOpts = {
  sessions: SessionMap;
  sseClients: SseClients;
  repoRoot: string;
  companion: CompanionRouteOptions;
  publicApi: PublicApiRouteOptions;
  isLoopback: (req: http.IncomingMessage) => boolean;
};

const NATIVE_ORIGINS = new Set(["capacitor://localhost", "http://localhost", "https://localhost"]);

export function applyCompanionCors(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
  const origin = req.headers.origin;
  if (!pathname.startsWith("/api/companion/") || typeof origin !== "string" || !NATIVE_ORIGINS.has(origin)) return false;
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  return true;
}

function handleNativePreflight(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
  const nativeOrigin = applyCompanionCors(req, res, pathname);
  if (req.method !== "OPTIONS" || !nativeOrigin) return false;
  res.writeHead(204); res.end(); return true;
}

function remoteDesktopBlocked(local: boolean, pathname: string): boolean {
  return !local && pathname !== "/companion" && !pathname.startsWith("/assets/");
}

async function routeByMethod(ctx: RouteCtx): Promise<boolean> {
  if (ctx.req.method === "GET") return routeGet(ctx);
  if (ctx.req.method === "POST") return routePost(ctx);
  return false;
}

async function routeRequest(req: http.IncomingMessage, res: http.ServerResponse, opts: ServerOpts): Promise<void> {
  const { sessions, sseClients, repoRoot } = opts;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const local = opts.isLoopback(req);
  const sid = local ? sessionIdFromRequest(req) : "default";
  if (await handlePublicApiProbeRoute({ req, res, pathname: url.pathname, options: opts.publicApi, sessions, root: repoRoot })) return;
  const state = getSession(sessions, sid, repoRoot);
  if (handleNativePreflight(req, res, url.pathname)) return;
  applyCompanionCors(req, res, url.pathname);
  state._sseSessionId = sid; state._sseClients = sseClients;
  const ctx: RouteCtx = { req, res, state, sid, sseClients, pathname: url.pathname };
  if (await handlePublicApiRoute({ req, res, state, pathname: url.pathname, options: opts.publicApi, sseClients, sid })) return;
  if (await handleCompanionRoute({ req, res, state, pathname: url.pathname, options: opts.companion, local, sseClients, sid })) return;
  if (remoteDesktopBlocked(local, url.pathname)) {
    sendJson(res, 403, { error: "desktop APIs are loopback-only" }); return;
  }
  const handled = await routeByMethod(ctx);
  if (!handled) sendJson(res, 404, { error: "not found" });
}

type DesktopServerOptions = Partial<CompanionRouteOptions> & {
  isLoopback?: (req: http.IncomingMessage) => boolean;
  publicApi?: boolean;
  publicApiAllowedOrigins?: readonly string[];
  sessions?: SessionMap;
  sseClients?: SseClients;
  readinessDeps?: ReadinessDeps;
};

export function createDesktopServer(repoRoot: string, options: DesktopServerOptions = {}): http.Server {
  ensureDesktopPermissionMode();
  const sessions: SessionMap = options.sessions ?? new Map();
  const sseClients: SseClients = options.sseClients ?? new Map();
  const companion = { enabled: options.enabled ?? false, home: options.home ?? resolveVantaHome(), port: options.port ?? 7790 };
  const publicApi = { enabled: options.publicApi ?? false, home: options.home ?? resolveVantaHome(), allowedOrigins: new Set(options.publicApiAllowedOrigins ?? []), readinessDeps: options.readinessDeps };
  const opts: ServerOpts = { sessions, sseClients, repoRoot, companion, publicApi, isLoopback: options.isLoopback ?? isLoopbackRequest };
  return http.createServer((req, res) => {
    void routeRequest(req, res, opts)
      .catch((err: unknown) => sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) }));
  });
}

export async function serveDesktop(repoRoot: string, port = 7790, companion = false): Promise<void> {
  const server = createDesktopServer(repoRoot, { enabled: companion, port });
  const host = companion ? "0.0.0.0" : "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  console.log(`vanta desktop — http://127.0.0.1:${port}${companion ? " · companion LAN enabled" : ""}`);
}
