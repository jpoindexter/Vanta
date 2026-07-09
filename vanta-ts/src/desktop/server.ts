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

type RouteCtx = { req: http.IncomingMessage; res: http.ServerResponse; state: DesktopState; sid: string; sseClients: SseClients; pathname: string };

async function routeGet(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  if (await writeDesktopAsset(state.root, p, res)) return true;
  if (p === "/api/events") { attachSse(sseClients, sid, res); return true; }
  if (p === "/api/status") { await handleStatus(state, res); return true; }
  if (p === "/api/sessions") { await handleSessions(res); return true; }
  if (p === "/api/tools") { await handleTools(state, res); return true; }
  if (p === "/api/files") { await handleFiles(state, res); return true; }
  if (p === "/api/canvas") { await handleCanvas(state, res); return true; }
  if (p === "/api/models") { await handleModels(res); return true; }
  if (p === "/api/approval") { await handleApproval(state, req, res); return true; }
  return false;
}

async function routePost(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  if (p === "/api/sessions/new") { await handleNewSession(state, res); return true; }
  if (p === "/api/sessions/open") { await handleOpenSession(state, req, res); return true; }
  if (p === "/api/model") { await handleSetModel(state, req, res); return true; }
  if (p === "/api/approval") { await handleApproval(state, req, res); return true; }
  if (p === "/api/terminal") { await handleTerminal(state, req, res); return true; }
  if (p === "/api/chat") {
    state._sseSessionId = sid; state._sseClients = sseClients;
    await handleChat(state, req, res); return true;
  }
  return false;
}

type ServerOpts = { sessions: SessionMap; sseClients: SseClients; repoRoot: string };

async function routeRequest(req: http.IncomingMessage, res: http.ServerResponse, opts: ServerOpts): Promise<void> {
  const { sessions, sseClients, repoRoot } = opts;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const sid = sessionIdFromRequest(req);
  const state = getSession(sessions, sid, repoRoot);
  const ctx: RouteCtx = { req, res, state, sid, sseClients, pathname: url.pathname };
  const handled = req.method === "GET" ? await routeGet(ctx) : req.method === "POST" ? await routePost(ctx) : false;
  if (!handled) sendJson(res, 404, { error: "not found" });
}

export function createDesktopServer(repoRoot: string): http.Server {
  const sessions: SessionMap = new Map();
  const sseClients: SseClients = new Map();
  const opts: ServerOpts = { sessions, sseClients, repoRoot };
  return http.createServer((req, res) => {
    void routeRequest(req, res, opts)
      .catch((err: unknown) => sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) }));
  });
}

export async function serveDesktop(repoRoot: string, port = 7790): Promise<void> {
  const server = createDesktopServer(repoRoot);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`vanta desktop — http://127.0.0.1:${port}`);
}
