import type http from "node:http";
import { networkInterfaces } from "node:os";
import { authenticateCompanion, exchangeCompanionCode, listCompanionDevices, startCompanionPairing } from "./auth.js";
import { handleApproval, handleChat, handleNewSession, handleOpenSession, handleSessions, handleStatus, readJson, sendJson, type DesktopState } from "../desktop/handlers.js";
import { attachSse, type SseClients } from "../desktop/session-state.js";

export type CompanionRouteOptions = { enabled: boolean; home: string; port: number };

export function isLoopbackRequest(req: http.IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address.startsWith("::ffff:127.");
}

export function companionUrls(port: number, interfaces = networkInterfaces()): string[] {
  const addresses = Object.values(interfaces).flat().filter((entry) => entry && entry.family === "IPv4" && !entry.internal).map((entry) => entry!.address);
  return [...new Set(addresses)].map((address) => `http://${address}:${port}/companion`);
}

export async function handleCompanionRoute(args: {
  req: http.IncomingMessage; res: http.ServerResponse; state: DesktopState; pathname: string; options: CompanionRouteOptions; local?: boolean; sseClients?: SseClients; sid?: string;
}): Promise<boolean> {
  const { req, res, state, pathname, options } = args;
  if (!pathname.startsWith("/api/companion/")) return false;
  const local = args.local ?? isLoopbackRequest(req);
  if (!local && !options.enabled) return forbidden(res);
  if (await handlePairingRoute({ req, res, pathname, options, local })) return true;
  if (!local && !await authorized(req, options.home)) return unauthorized(res);
  return handleAuthorizedRoute({ req, res, state, pathname, sseClients: args.sseClients, sid: args.sid });
}

async function handlePairingRoute(args: {
  req: http.IncomingMessage; res: http.ServerResponse; pathname: string; options: CompanionRouteOptions; local: boolean;
}): Promise<boolean> {
  const handler = PAIRING_ROUTES[args.pathname];
  return handler ? handler(args) : false;
}

type PairRouteArgs = Parameters<typeof handlePairingRoute>[0];
const PAIRING_ROUTES: Record<string, (args: PairRouteArgs) => Promise<boolean>> = {
  "/api/companion/pair/start": startPairing,
  "/api/companion/pair": exchangePairing,
  "/api/companion/info": companionInfo,
};

async function startPairing({ req, res, options, local }: PairRouteArgs): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (!local || !options.enabled) return forbidden(res);
  const pairing = await startCompanionPairing(options.home);
  sendJson(res, 200, { ...pairing, urls: companionUrls(options.port) });
  return true;
}

async function exchangePairing({ req, res, options }: PairRouteArgs): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (!options.enabled) return forbidden(res);
  const body = await readJson(req) as { code?: unknown; name?: unknown };
  const result = await exchangeCompanionCode(options.home, String(body.code ?? ""), String(body.name ?? "Mobile companion"));
  sendJson(res, "error" in result ? 401 : 200, result);
  return true;
}

async function companionInfo({ req, res, options, local }: PairRouteArgs): Promise<boolean> {
  if (req.method !== "GET") return false;
  if (!local) return forbidden(res);
  sendJson(res, 200, { enabled: options.enabled, urls: companionUrls(options.port), devices: await listCompanionDevices(options.home) });
  return true;
}

type AuthorizedArgs = { req: http.IncomingMessage; res: http.ServerResponse; state: DesktopState; pathname: string; sseClients?: SseClients; sid?: string };

async function handleAuthorizedRoute(args: AuthorizedArgs): Promise<boolean> {
  const { req, res, state } = args;
  const routes: Record<string, () => Promise<void>> = {
    "GET:/api/companion/status": () => handleStatus(state, res),
    "POST:/api/companion/chat": () => handleStreamingChat(state, req, res),
    "GET:/api/companion/approval": () => handleApproval(state, req, res),
    "POST:/api/companion/approval": () => handleApproval(state, req, res),
    "GET:/api/companion/sessions": () => handleSessions(res),
    "POST:/api/companion/sessions/new": () => handleNewSession(state, res),
    "POST:/api/companion/sessions/open": () => handleOpenSession(state, req, res),
  };
  const handler = routes[`${req.method}:${args.pathname}`];
  if (handler) { await handler(); return true; }
  if (req.method === "GET" && args.pathname === "/api/companion/events" && args.sseClients) {
    attachSse(args.sseClients, args.sid ?? "default", res); return true;
  }
  return false;
}

async function handleStreamingChat(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  state._streamTextDeltas = true;
  try { await handleChat(state, req, res); }
  finally { state._streamTextDeltas = false; }
}

async function authorized(req: http.IncomingMessage, home: string): Promise<boolean> {
  const value = req.headers.authorization;
  const token = value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
  return !!await authenticateCompanion(home, token);
}

function forbidden(res: http.ServerResponse): true { sendJson(res, 403, { error: "companion access is not available" }); return true; }
function unauthorized(res: http.ServerResponse): true { sendJson(res, 401, { error: "pair this companion first" }); return true; }
