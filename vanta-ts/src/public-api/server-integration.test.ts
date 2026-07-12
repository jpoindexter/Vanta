import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { VantaClient } from "../../packages/sdk/src/index.js";
import { createDesktopServer } from "../desktop/server.js";
import { getSession, pushSseEvent, type SessionMap, type SseClients } from "../desktop/session-state.js";
import { issuePublicApiToken, revokePublicApiToken } from "./auth.js";

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))));

describe("public API v1", () => {
  it("serves non-mutating liveness and authenticated readiness before allocating a session", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-api-readiness-")); homes.push(home);
    const root = await mkdtemp(join(tmpdir(), "vanta-api-readiness-root-")); homes.push(root);
    const issued = await issuePublicApiToken(home, "Supervisor");
    const tokenPath = join(home, "public-api-tokens.json");
    const before = await readFile(tokenPath, "utf8");
    const sessions: SessionMap = new Map();
    const server = createDesktopServer(root, {
      publicApi: true, home, port: 0, sessions,
      readinessDeps: {
        env: { VANTA_PROVIDER: "codex" },
        kernelStatus: async () => true,
        diskStat: async () => ({ bavail: 90, blocks: 100, bsize: 1024 ** 3 }),
      },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
      expect(await (await fetch(`${base}/live`)).json()).toEqual({ apiVersion: "v1", status: "live" });
      expect((await fetch(`${base}/live`, { method: "OPTIONS" })).status).toBe(403);
      expect((await fetch(`${base}/readiness`)).status).toBe(401);
      const response = await fetch(`${base}/readiness`, { headers: { authorization: `Bearer ${issued.token}` } });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ apiVersion: "v1", status: "ready", checks: { kernel: { status: "ok" }, activity: { activeTurns: 0 } } });
      expect((await fetch(`${base}/status`, { headers: { authorization: `Bearer ${issued.token}` } })).status).toBe(200);
      expect(sessions.size).toBe(0);
      expect(await readFile(tokenPath, "utf8")).toBe(before);
    } finally { await closeServer(server); }
  });

  it("requires bearer auth and lets the SDK stream events and resolve approval", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-api-server-")); homes.push(home);
    const sessions: SessionMap = new Map();
    const sseClients: SseClients = new Map();
    const channelId = "sdk-integration";
    const state = getSession(sessions, channelId, join(process.cwd(), ".."));
    let approved: boolean | undefined;
    state.pendingApproval = { id: "approval-1", action: "write report", reason: "changes a file", toolName: "write_file", resolve: (value) => { approved = value; } };
    const issued = await issuePublicApiToken(home, "SDK test");
    const server = createDesktopServer(state.root, { publicApi: true, home, port: 0, sessions, sseClients });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      expect((await fetch(`${baseUrl}/api/v1/sessions`)).status).toBe(401);
      const client = new VantaClient({ baseUrl, token: issued.token, channelId });
      expect(await client.currentApproval()).toMatchObject({ id: "approval-1", toolName: "write_file" });

      const stream = client.events();
      const next = stream.next();
      await waitFor(() => Boolean(sseClients.get(channelId)?.size));
      pushSseEvent(sseClients, channelId, { label: "", delta: "STREAM_OK" });
      await expect(next).resolves.toEqual({ done: false, value: { apiVersion: "v1", type: "output.delta", sessionId: channelId, delta: "STREAM_OK" } });
      await stream.return(undefined);

      await expect(client.resolveApproval("approval-1", "allow")).resolves.toEqual({ ok: true });
      expect(approved).toBe(true);
      await revokePublicApiToken(home, issued.record.id);
      await expect(client.currentApproval()).rejects.toMatchObject({ status: 401 });
    } finally { await closeServer(server); }
  });

  it("allows exact HTTPS CORS origins for preflight and rejects other browser origins", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-api-cors-")); homes.push(home); const issued = await issuePublicApiToken(home, "Excel add-in");
    const state = getSession(new Map(), "excel", join(process.cwd(), "..")), server = createDesktopServer(state.root, { publicApi: true, publicApiAllowedOrigins: ["https://localhost:3000"], home, port: 0 });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/sessions`, allowed = "https://localhost:3000";
      const preflight = await fetch(base, { method: "OPTIONS", headers: { origin: allowed, "access-control-request-method": "GET", "access-control-request-headers": "authorization,x-session-id" } });
      expect(preflight.status).toBe(204); expect(preflight.headers.get("access-control-allow-origin")).toBe(allowed); expect(preflight.headers.get("access-control-allow-headers")).toContain("x-session-id");
      expect((await fetch(base, { headers: { origin: "https://evil.example", authorization: `Bearer ${issued.token}` } })).status).toBe(403);
      const accepted = await fetch(base, { headers: { origin: allowed, authorization: `Bearer ${issued.token}` } }); expect(accepted.status).toBe(200); expect(accepted.headers.get("access-control-allow-origin")).toBe(allowed);
    } finally { await closeServer(server); }
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for SSE client");
}

async function closeServer(server: ReturnType<typeof createDesktopServer>): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
