import http from "node:http";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { desktopBoundaryDecision } from "./server.js";
import { handleLiveSession, retainChatResult } from "./live-session.js";
import type { DesktopState } from "./handler-state.js";

// Thin HTTP harness around the actual route handler and existing auth predicate.
// The complete server-routes registration is independently exercised by the parent.
const box = mkdtempSync(join(tmpdir(), "vanta-live-http-"));
const root = join(box, "project"), home = join(box, "home");
mkdirSync(root); mkdirSync(home);
const sessions = new Map<string, DesktopState>();
const state = { root, _env: { VANTA_HOME: home, VANTA_PROFILE: "writer" }, _sessions: sessions,
  _sseSessionId: "client", sessionId: "stored", _chatActive: true, _chatAbort: new AbortController(),
  _chatRun: { requestId: "req-original", sessionId: "stored" },
  convo: { messages: [], send: async () => { throw new Error("not executed"); }, setProvider() {}, setSessionMemory() {} },
} as DesktopState;
sessions.set("client", state);
let base = "";
const server = http.createServer((req, res) => {
  const boundary = desktopBoundaryDecision(req, new URL(req.url!, "http://localhost"), "private-test-boundary");
  if (!boundary.allowed) { res.writeHead(boundary.status); res.end(); return; }
  void handleLiveSession(state, req, res);
});
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
const read = (query = "storedId=stored&requestId=req-original", token = "private-test-boundary") => fetch(`${base}/api/sessions/live?${query}`, {
  headers: { "x-vanta-desktop-boundary": token }, signal: AbortSignal.timeout(2000),
});
it("rejects a wrong boundary credential before exposing the live tuple", async () => {
  expect((await read(undefined, "wrong")).status).toBe(403);
});
it("rejects missing, duplicate, malformed and stale tuple inputs", async () => {
  for (const query of ["", "storedId=stored", "storedId=wrong&requestId=req-original", "storedId=stored&requestId=wrong", "storedId=stored&requestId=../wrong", "storedId=stored&requestId=req-original&requestId=req-original"]) {
    expect((await read(query)).status).toBe(409);
  }
});
it("returns the same open-shaped envelope without initializing or replacing a conversation", async () => {
  const convo = state.convo, run = state._chatRun;
  const response = await read();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: "stored", messages: [], live: { clientId: "client", requestId: "req-original", profile: "writer", running: true } });
  expect(state.convo).toBe(convo); expect(state._chatRun).toBe(run); expect(state.setup).toBeUndefined();
});
it("reports retained interrupted result as terminal before finally clears running", async () => {
  retainChatResult(state, "req-original", { finalText: "Stopped by operator.", stoppedReason: "interrupted", interrupted: true });
  expect(state._chatActive).toBe(true);
  const response = await read();
  expect(await response.json()).toMatchObject({ live: { running: false, result: { stoppedReason: "interrupted", interrupted: true } } });
});
