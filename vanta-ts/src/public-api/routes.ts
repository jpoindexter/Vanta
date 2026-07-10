import type http from "node:http";
import { authenticatePublicApiToken } from "./auth.js";
import {
  handleApproval, handleChat, handleNewSession, handleOpenSession, handleSessions,
  handleStatus, sendJson, type DesktopState,
} from "../desktop/handlers.js";
import { attachSse, pushSseEvent, type SseClients } from "../desktop/session-state.js";

export type PublicApiRouteOptions = { enabled: boolean; home: string };
type RouteArgs = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  state: DesktopState;
  pathname: string;
  options: PublicApiRouteOptions;
  sseClients: SseClients;
  sid: string;
};

export async function handlePublicApiRoute(args: RouteArgs): Promise<boolean> {
  if (!args.pathname.startsWith("/api/v1/")) return false;
  if (!args.options.enabled) return forbidden(args.res);
  if (!await authorized(args.req, args.options.home)) return unauthorized(args.res);

  const key = `${args.req.method}:${args.pathname}`;
  const routes: Record<string, () => Promise<void>> = {
    "GET:/api/v1/status": () => handleStatus(args.state, args.res),
    "GET:/api/v1/sessions": () => handleSessions(args.res),
    "POST:/api/v1/sessions": () => handleNewSession(args.state, args.res),
    "POST:/api/v1/sessions/open": () => handleOpenSession(args.state, args.req, args.res),
    "POST:/api/v1/input": () => handleStreamingInput(args.state, args.req, args.res),
    "GET:/api/v1/approvals/current": () => handleApproval(args.state, args.req, args.res),
    "POST:/api/v1/approvals/resolve": () => handleApproval(args.state, args.req, args.res),
  };
  const handler = routes[key];
  if (handler) { await handler(); return true; }
  if (key === "GET:/api/v1/events") {
    attachSse(args.sseClients, args.sid, args.res, (event) => publicFrame(args.sid, event));
    return true;
  }
  return false;
}

async function handleStreamingInput(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  state._streamTextDeltas = true;
  try {
    await handleChat(state, req, res);
    pushTerminalEvent(state, true);
  } catch (error) {
    pushTerminalEvent(state, false);
    throw error;
  }
  finally { state._streamTextDeltas = false; }
}

function publicFrame(sessionId: string, event: { label: string; ok?: boolean; delta?: string }) {
  if (event.delta !== undefined) {
    return { event: "output.delta", data: { apiVersion: "v1", type: "output.delta", sessionId, delta: event.delta } };
  }
  if (event.label === "turn.completed") {
    return { event: "turn.completed", data: { apiVersion: "v1", type: "turn.completed", sessionId, ok: event.ok ?? false } };
  }
  return { event: "activity", data: { apiVersion: "v1", type: "activity", sessionId, label: event.label, ...(event.ok === undefined ? {} : { ok: event.ok }) } };
}

function pushTerminalEvent(state: DesktopState, ok: boolean): void {
  if (state._sseClients && state._sseSessionId) {
    pushSseEvent(state._sseClients, state._sseSessionId, { label: "turn.completed", ok });
  }
}

async function authorized(req: http.IncomingMessage, home: string): Promise<boolean> {
  const value = req.headers.authorization;
  const token = value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
  return !!await authenticatePublicApiToken(home, token);
}

function forbidden(res: http.ServerResponse): true { sendJson(res, 403, { error: "public API is not enabled" }); return true; }
function unauthorized(res: http.ServerResponse): true { sendJson(res, 401, { error: "valid bearer token required" }); return true; }
