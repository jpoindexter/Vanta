import http from "node:http";
import type { DesktopState, DesktopEvent } from "./handlers.js";
import {
  eventLabel, readJson, sendJson,
  handleStatus, handleSessions, handleNewSession, handleOpenSession,
  handleTools, handleFiles, handleCanvas, handleModels, handleSetModel,
  handleApproval, handleTerminal, handleChat,
} from "./handlers.js";
export { approvalDecision, type PendingApproval, type DesktopEvent, type DesktopState, eventLabel } from "./handlers.js";
import {
  getSession, attachSse, sessionIdFromRequest,
  type SessionMap, type SseClients,
} from "./session-state.js";
import { writeDesktopAsset } from "./assets.js";
import { handleCompanionRoute, isLoopbackRequest, type CompanionRouteOptions } from "../companion/routes.js";
import { resolveVantaHome } from "../store/home.js";
import { getWakeApi, setWakeApi } from "./wake-api.js";

type RouteCtx = { req: http.IncomingMessage; res: http.ServerResponse; state: DesktopState; sid: string; sseClients: SseClients; pathname: string };

async function routeGet(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  if (await writeDesktopAsset(state.root, p, res)) return true;
  if (p === "/api/events") { attachSse(sseClients, sid, res); return true; }
  const handler: Record<string, () => Promise<void>> = {
    "/api/status": () => handleStatus(state, res),
    "/api/sessions": () => handleSessions(res),
    "/api/tools": () => handleTools(state, res),
    "/api/files": () => handleFiles(state, res),
    "/api/canvas": () => handleCanvas(state, res),
    "/api/models": () => handleModels(res),
    "/api/approval": () => handleApproval(state, req, res),
    "/api/wake": async () => sendJson(res, 200, await getWakeApi()),
  };
  if (handler[p]) { await handler[p](); return true; }
  return false;
}

async function routePost(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  if (p === "/api/sessions/new") { await handleNewSession(state, res); return true; }
  if (p === "/api/sessions/open") { await handleOpenSession(state, req, res); return true; }
  if (p === "/api/model") { await handleSetModel(state, req, res); return true; }
  if (p === "/api/approval") { await handleApproval(state, req, res); return true; }
  if (p === "/api/terminal") { await handleTerminal(state, req, res); return true; }
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

type ServerOpts = { sessions: SessionMap; sseClients: SseClients; repoRoot: string; companion: CompanionRouteOptions; isLoopback: (req: http.IncomingMessage) => boolean };

async function routeRequest(req: http.IncomingMessage, res: http.ServerResponse, opts: ServerOpts): Promise<void> {
  const { sessions, sseClients, repoRoot } = opts;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const local = opts.isLoopback(req);
  const sid = local ? sessionIdFromRequest(req) : "default";
  const state = getSession(sessions, sid, repoRoot);
  const ctx: RouteCtx = { req, res, state, sid, sseClients, pathname: url.pathname };
  if (await handleCompanionRoute({ req, res, state, pathname: url.pathname, options: opts.companion, local })) return;
  if (!local && url.pathname !== "/companion" && !url.pathname.startsWith("/assets/")) {
    sendJson(res, 403, { error: "desktop APIs are loopback-only" }); return;
  }
  const handled = req.method === "GET" ? await routeGet(ctx) : req.method === "POST" ? await routePost(ctx) : false;
  if (!handled) sendJson(res, 404, { error: "not found" });
}

export function createDesktopServer(repoRoot: string, options: Partial<CompanionRouteOptions> & { isLoopback?: (req: http.IncomingMessage) => boolean } = {}): http.Server {
  const sessions: SessionMap = new Map();
  const sseClients: SseClients = new Map();
  const companion = { enabled: options.enabled ?? false, home: options.home ?? resolveVantaHome(), port: options.port ?? 7790 };
  const opts: ServerOpts = { sessions, sseClients, repoRoot, companion, isLoopback: options.isLoopback ?? isLoopbackRequest };
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
