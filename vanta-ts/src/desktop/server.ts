import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { markLaunch } from "../cli/launch-trace.js";
import type { DesktopState } from "./handlers.js";
import { sendJson } from "./handler-http.js";
import { getSession, sessionIdFromRequest, type SessionMap, type SseClients } from "./session-state.js";
import { writeDesktopAsset } from "./assets.js";
import type { CompanionRouteOptions } from "../companion/routes.js";
import { isLoopbackRequest } from "../companion/loopback.js";
import type { PublicApiRouteOptions } from "../public-api/routes.js";
import type { ReadinessDeps } from "../public-api/readiness.js";
import { resolveVantaHome } from "../store/home.js";
import { applyTimezone, loadDesktopPrefs } from "./desktop-prefs.js";
import { ensureDesktopPermissionMode } from "./permission-mode.js";
import { loadDesktopRoutes, handleCompanionRouteLazy, handlePublicApiRouteLazy, handlePublicApiProbeRouteLazy } from "./server-lazy.js";
export type { PendingApproval, DesktopEvent, DesktopState } from "./handlers.js";

type RouteCtx = { req: http.IncomingMessage; res: http.ServerResponse; state: DesktopState; sid: string; sseClients: SseClients; pathname: string };

type ServerOpts = {
  sessions: SessionMap;
  sseClients: SseClients;
  repoRoot: string;
  companion: CompanionRouteOptions;
  publicApi: PublicApiRouteOptions;
  isLoopback: (req: http.IncomingMessage) => boolean;
  boundaryToken?: string;
  env: NodeJS.ProcessEnv;
};

const NATIVE_ORIGINS = new Set(["capacitor://localhost", "http://localhost", "https://localhost"]);

export function applyCompanionCors(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): boolean {
  const origin = req.headers.origin;
  if (!pathname.startsWith("/api/companion/") || typeof origin !== "string" || !NATIVE_ORIGINS.has(origin)) return false;
  // The echoed value must be an exact member of the fixed native-origin set.
  // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration
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

type DesktopBoundaryDecision = { allowed: true } | { allowed: false; status: 403 | 405; error: string };

export function desktopBoundaryDecision(req: http.IncomingMessage, url: URL, boundaryToken?: string): DesktopBoundaryDecision {
  if (!url.pathname.startsWith("/api/") || !boundaryToken) return { allowed: true };
  if (req.method !== "GET" && req.method !== "POST") return { allowed: false, status: 405, error: "method not allowed" };
  const supplied = desktopBoundaryCredential(req, url);
  if (typeof supplied !== "string" || !sameToken(supplied, boundaryToken)) return { allowed: false, status: 403, error: "trusted desktop renderer required" };
  if (!desktopRequestOriginAllowed(req) || !desktopFetchSiteAllowed(req)) return { allowed: false, status: 403, error: "cross-origin desktop request denied" };
  return { allowed: true };
}

function desktopBoundaryCredential(req: http.IncomingMessage, url: URL): string | string[] | null | undefined {
  const header = req.headers["x-vanta-desktop-boundary"];
  if (header !== undefined) return header;
  return url.pathname === "/api/events" ? url.searchParams.get("boundary") : undefined;
}

function desktopRequestOriginAllowed(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return true;
  const host = req.headers.host;
  return Boolean(host && origin === `http://${host}`);
}

function desktopFetchSiteAllowed(req: http.IncomingMessage): boolean {
  const fetchSite = req.headers["sec-fetch-site"];
  return typeof fetchSite !== "string" || fetchSite === "same-origin" || fetchSite === "none";
}

function sameToken(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function routeRequest(req: http.IncomingMessage, res: http.ServerResponse, opts: ServerOpts): Promise<void> {
  const { sessions, sseClients, repoRoot } = opts;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const local = opts.isLoopback(req);
  const sid = local ? sessionIdFromRequest(req) : "default";
  if (await handlePublicApiProbeRouteLazy({ req, res, pathname: url.pathname, options: opts.publicApi, sessions, root: repoRoot })) return;
  const state = getSession(sessions, sid, repoRoot);
  state._env ??= opts.env;
  if (handleNativePreflight(req, res, url.pathname)) return;
  applyCompanionCors(req, res, url.pathname);
  state._sseSessionId = sid; state._sseClients = sseClients; state._sessions = sessions;
  const ctx: RouteCtx = { req, res, state, sid, sseClients, pathname: url.pathname };
  if (await handlePublicApiRouteLazy({ req, res, state, pathname: url.pathname, options: opts.publicApi, sseClients, sid })) return;
  // Loopback is not authentication: other callers retain only the enabled, code/bearer-gated companion paths.
  const trustedCompanionLocal = local && desktopBoundaryDecision(req, url, opts.boundaryToken).allowed;
  if (await handleCompanionRouteLazy({ req, res, state, pathname: url.pathname, options: opts.companion, local: trustedCompanionLocal, sseClients, sid })) return;
  if (denyDesktopRequest(req, res, url, { local, boundaryToken: opts.boundaryToken })) return;
  await routeDesktop(ctx);
}

/** Static assets answer without the route modules; everything else waits for them. */
async function routeDesktop(ctx: RouteCtx): Promise<void> {
  if (ctx.req.method === "GET" && await writeDesktopAsset(ctx.state.root, ctx.pathname, ctx.res)) return;
  const handled = await (await loadDesktopRoutes()).routeByMethod(ctx);
  if (!handled) sendJson(ctx.res, 404, { error: "not found" });
}

type DesktopServerOptions = Partial<CompanionRouteOptions> & {
  isLoopback?: (req: http.IncomingMessage) => boolean;
  publicApi?: boolean;
  publicApiAllowedOrigins?: readonly string[];
  sessions?: SessionMap;
  sseClients?: SseClients;
  readinessDeps?: ReadinessDeps;
  boundaryToken?: string;
  env?: NodeJS.ProcessEnv;
};

export function createDesktopServer(repoRoot: string, options: DesktopServerOptions = {}): http.Server {
  ensureDesktopPermissionMode();
  const opts = desktopServerOptions(repoRoot, options);
  void loadDesktopPrefs(opts.env).then((prefs) => applyTimezone(prefs, opts.env)).catch(() => undefined);
  return http.createServer((req, res) => {
    void routeRequest(req, res, opts)
      .catch((err: unknown) => sendJson(res, 500, { error: errorMessage(err) }));
  });
}

function desktopServerOptions(repoRoot: string, options: DesktopServerOptions): ServerOpts {
  const home = options.home ?? resolveVantaHome();
  return {
    sessions: options.sessions ?? new Map(),
    sseClients: options.sseClients ?? new Map(),
    repoRoot,
    companion: companionOptions(home, options),
    publicApi: { enabled: options.publicApi ?? false, home, allowedOrigins: new Set(options.publicApiAllowedOrigins ?? []), readinessDeps: options.readinessDeps },
    isLoopback: options.isLoopback ?? isLoopbackRequest,
    boundaryToken: options.boundaryToken ?? process.env.VANTA_DESKTOP_BOUNDARY_TOKEN,
    env: options.env ?? process.env,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function serveDesktop(
  repoRoot: string,
  options: { port?: number; companion?: boolean; boundaryToken?: string; launchUrl?: string } = {},
): Promise<void> {
  const { port = 7790, companion = false, boundaryToken = process.env.VANTA_DESKTOP_BOUNDARY_TOKEN } = options;
  const launchUrl = options.launchUrl ?? `http://127.0.0.1:${port}`;
  if (!boundaryToken) throw new Error("desktop boundary token is required");
  markLaunch("server module loaded");
  const server = createDesktopServer(repoRoot, { enabled: companion, port, boundaryToken });
  const host = companion ? "0.0.0.0" : "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  markLaunch("listening");
  void loadDesktopRoutes().then(() => markLaunch("routes loaded"), () => undefined);
  console.log(`vanta desktop — ${launchUrl}${companion ? " · companion LAN enabled" : ""}`);
}

function denyDesktopRequest(req: http.IncomingMessage, res: http.ServerResponse, url: URL, options: { local: boolean; boundaryToken?: string }): boolean {
  const { local, boundaryToken } = options;
  if (remoteDesktopBlocked(local, url.pathname)) {
    sendJson(res, 403, { error: "desktop APIs are loopback-only" }); return true;
  }
  const boundary = desktopBoundaryDecision(req, url, boundaryToken);
  if (!boundary.allowed) {
    sendJson(res, boundary.status, { error: boundary.error }); return true;
  }
  return false;
}

function companionOptions(home: string, options: DesktopServerOptions): CompanionRouteOptions {
  return { enabled: options.enabled ?? false, home, port: options.port ?? 7790 };
}
