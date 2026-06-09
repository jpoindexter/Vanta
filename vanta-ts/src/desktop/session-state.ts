import http from "node:http";
import type { DesktopState, DesktopEvent } from "./server.js";

// DESKTOP-P2: per-session state map so parallel tabs don't clobber each other.
// DESKTOP-P1: SSE event channel so the UI updates live during an agent run.

/** Map from sessionId → DesktopState. Keyed by the UUID the client tracks. */
export type SessionMap = Map<string, DesktopState>;

/** Map from sessionId → set of active SSE response streams. */
export type SseClients = Map<string, Set<http.ServerResponse>>;

/** Get or create the DesktopState for a session id. */
export function getSession(sessions: SessionMap, id: string, root: string): DesktopState {
  if (!sessions.has(id)) sessions.set(id, { root });
  return sessions.get(id)!;
}

/** Delete a session's state (on /sessions/new with an id collision guard). */
export function clearSession(sessions: SessionMap, id: string): void {
  sessions.delete(id);
}

/**
 * Register an SSE connection. Writes the SSE handshake and keeps the
 * connection open until the client disconnects.
 */
export function attachSse(clients: SseClients, sessionId: string, res: http.ServerResponse): void {
  if (!clients.has(sessionId)) clients.set(sessionId, new Set());
  const set = clients.get(sessionId)!;
  set.add(res);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
  res.write("retry: 1000\n\n");
  res.on("close", () => {
    set.delete(res);
    if (!set.size) clients.delete(sessionId);
  });
}

/** Push one event to all SSE subscribers for a session. */
export function pushSseEvent(clients: SseClients, sessionId: string, event: DesktopEvent): void {
  const set = clients.get(sessionId);
  if (!set?.size) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch { set.delete(res); }
  }
}

/** Extract session id from request (X-Session-Id header or ?session= query param). */
export function sessionIdFromRequest(req: http.IncomingMessage): string {
  const header = req.headers["x-session-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const url = new URL(req.url ?? "/", "http://localhost");
  const param = url.searchParams.get("session");
  if (param?.trim()) return param.trim();
  return "default";
}
