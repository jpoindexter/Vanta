import type http from "node:http";
import { authenticatePublicApiToken } from "./auth.js";
import {
  handleApproval, handleChat, handleNewSession, handleOpenSession, handleSessions,
  sendJson, type DesktopState,
} from "../desktop/handlers.js";
import { attachSse, pushSseEvent, type SseClients } from "../desktop/session-state.js";
import type { SessionMap } from "../desktop/session-state.js";
import { collectRuntimeReadiness, type ReadinessDeps } from "./readiness.js";

export type PublicApiRouteOptions = { enabled: boolean; home: string; allowedOrigins: ReadonlySet<string>; readinessDeps?: ReadinessDeps };
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
  const cors = applyPublicApiCors(args.req, args.res, args.options.allowedOrigins);
  if (args.req.method === "OPTIONS") { args.res.writeHead(cors ? 204 : 403); args.res.end(); return true; }
  if (args.req.headers.origin && !cors) return forbiddenOrigin(args.res);
  if (!await authorized(args.req, args.options.home)) return unauthorized(args.res);

  const key = `${args.req.method}:${args.pathname}`;
  const routes: Record<string, () => Promise<void>> = {
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

type ProbeArgs = Pick<RouteArgs, "req" | "res" | "pathname" | "options"> & { sessions: SessionMap; root: string };

/** Handle health probes before a DesktopState is allocated or initialized. */
export async function handlePublicApiProbeRoute(args: ProbeArgs): Promise<boolean> {
  const live = args.pathname === "/api/v1/live";
  const readiness = ["/api/v1/readiness", "/api/v1/status"].includes(args.pathname);
  if (!live && !readiness) return false;
  if (!args.options.enabled) return forbidden(args.res);
  const cors = applyPublicApiCors(args.req, args.res, args.options.allowedOrigins);
  if (args.req.method === "OPTIONS") { args.res.writeHead(cors ? 204 : 403); args.res.end(); return true; }
  if (args.req.method !== "GET") return false;
  if (args.req.headers.origin && !cors) return forbiddenOrigin(args.res);
  if (live) { sendJson(args.res, 200, { apiVersion: "v1", status: "live" }); return true; }
  if (!await authorized(args.req, args.options.home, false)) return unauthorized(args.res);
  sendJson(args.res, 200, await collectRuntimeReadiness(args.root, args.options.home, args.sessions, args.options.readinessDeps));
  return true;
}

export function parsePublicApiAllowedOrigins(raw: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const entry of (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean)) {
    const url = new URL(entry); if (url.protocol !== "https:" || url.origin !== entry) throw new Error(`public API CORS origin must be an exact HTTPS origin: ${entry}`); origins.add(entry);
  }
  return origins;
}

function applyPublicApiCors(req: http.IncomingMessage, res: http.ServerResponse, allowed: ReadonlySet<string>): boolean {
  const origin = req.headers.origin; if (typeof origin !== "string" || !allowed.has(origin)) return false;
  res.setHeader("access-control-allow-origin", origin); res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-headers", "authorization, content-type, x-session-id"); res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS"); return true;
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

async function authorized(req: http.IncomingMessage, home: string, touch = true): Promise<boolean> {
  const value = req.headers.authorization;
  const token = value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
  return !!await authenticatePublicApiToken(home, token, Date.now(), { touch });
}

function forbidden(res: http.ServerResponse): true { sendJson(res, 403, { error: "public API is not enabled" }); return true; }
function forbiddenOrigin(res: http.ServerResponse): true { sendJson(res, 403, { error: "public API origin is not allowed" }); return true; }
function unauthorized(res: http.ServerResponse): true { sendJson(res, 401, { error: "valid bearer token required" }); return true; }
