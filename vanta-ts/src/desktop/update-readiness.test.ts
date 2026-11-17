import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopServer } from "./server.js";
import type { DesktopState } from "./handler-state.js";
import { DesktopTurnQueue, desktopTurnQueuePath, fileTurnQueueDeps } from "./turn-queue.js";
import { trackRun } from "./company-run-state.js";

const routes = vi.hoisted(() => ({
  run: vi.fn(async (_ctx: unknown): Promise<boolean> => false),
  early: vi.fn(async (_ctx: unknown): Promise<boolean> => false),
}));
vi.mock("./server-lazy.js", () => ({
  loadDesktopRoutes: async () => ({ routeByMethod: routes.run }),
  handlePublicApiProbeRouteLazy: async () => false,
  handlePublicApiRouteLazy: (ctx: unknown) => routes.early(ctx),
  handleCompanionRouteLazy: async () => false,
}));

const TOKEN = "isolated-update-boundary";
const PREPARE = "/api/desktop/update/prepare";
const CANCEL = "/api/desktop/update/cancel";
const cleanup: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  routes.run.mockReset().mockResolvedValue(false);
  routes.early.mockReset().mockResolvedValue(false);
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

async function fixture(token = TOKEN) {
  const root = await mkdtemp(join(tmpdir(), "vanta-update-readiness-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const sessions = new Map<string, DesktopState>();
  const home = join(root, "home");
  const server = createDesktopServer(root, { home, sessions, boundaryToken: token, env: { VANTA_HOME: home } });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown = {}, headers: Record<string, string> = { "x-vanta-desktop-boundary": TOKEN }) => fetch(base + path, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  return { root, sessions, home, base, post };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("desktop update native preparation over HTTP", () => {
  it("freezes mutations until the exact lease is cancelled, without blocking reads", async () => {
    const h = await fixture();
    const prepared = await h.post(PREPARE);
    expect(prepared.status).toBe(200);
    const { lease } = await prepared.json() as { lease: string };
    expect(lease).toEqual(expect.any(String));
    expect((await h.post("/api/chat")).status).toBe(409);
    expect((await fetch(h.base + "/api/status", { headers: { "x-vanta-desktop-boundary": TOKEN } })).status).toBe(404);
    expect((await h.post(CANCEL, { lease: "wrong" })).status).toBe(409);
    expect((await h.post("/api/chat")).status).toBe(409);
    expect((await h.post(CANCEL, { lease })).status).toBe(200);
    expect((await h.post("/api/chat")).status).toBe(404);
  });

  it("requires a configured native boundary, correct token and same origin", async () => {
    const h = await fixture();
    expect((await h.post(PREPARE, {}, {})).status).toBe(403);
    expect((await h.post(PREPARE, {}, { "x-vanta-desktop-boundary": "wrong" })).status).toBe(403);
    const crossOrigin = await fetch(h.base + PREPARE, { method: "POST", headers: { "x-vanta-desktop-boundary": TOKEN, origin: "https://elsewhere.example" } });
    expect(crossOrigin.status).toBe(403);
    expect((await (await fixture("")).post(PREPARE)).status).toBe(403);
  });

  it.each(["active", "approval"])("checks every client for %s work and releases failed preparation", async kind => {
    const h = await fixture();
    const state: DesktopState = { root: h.root };
    if (kind === "active") state._chatActive = true;
    else state.pendingApproval = { id: "pending", action: "write", reason: "test", resolve: () => {} };
    h.sessions.set("other-window", state);
    expect((await h.post(PREPARE)).status).toBe(409);
    state._chatActive = false;
    state.pendingApproval = undefined;
    expect((await h.post("/api/chat")).status).toBe(404);
    expect((await h.post(PREPARE)).status).toBe(200);
  });

  it("counts an admitted handler until its Promise settles, even after HTTP 202", async () => {
    const h = await fixture();
    const started = deferred();
    const finish = deferred();
    routes.run.mockImplementation(async (raw: unknown) => {
      const { pathname, res } = raw as { pathname: string; res: http.ServerResponse };
      if (pathname !== "/api/test-workflow") return false;
      res.writeHead(202); res.end("accepted"); started.resolve();
      await finish.promise;
      return true;
    });
    expect((await h.post("/api/test-workflow")).status).toBe(202);
    await started.promise;
    const rejected = await h.post(PREPARE);
    finish.resolve();
    expect(rejected.status).toBe(409);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect((await h.post(PREPARE)).status).toBe(200);
  });

  it("reserves before the early public/companion route await", async () => {
    const h = await fixture();
    const started = deferred();
    const finish = deferred();
    routes.early.mockImplementation(async (raw: unknown) => {
      const { pathname } = raw as { pathname: string };
      if (pathname !== "/api/v1/admission") return false;
      started.resolve(); await finish.promise; return false;
    });
    const pending = h.post("/api/v1/admission");
    await started.promise;
    const rejected = await h.post(PREPARE);
    finish.resolve(); await pending;
    expect(rejected.status).toBe(409);
    expect((await h.post(PREPARE)).status).toBe(200);
    routes.early.mockClear();
    expect((await h.post("/api/v1/admission")).status).toBe(409);
    expect(routes.early).not.toHaveBeenCalled();
  });

  it("checks a persisted queue even before any session has loaded it", async () => {
    const h = await fixture();
    const queue = new DesktopTurnQueue(fileTurnQueueDeps(desktopTurnQueuePath(h.root, { VANTA_HOME: h.home })));
    await queue.enqueue({ instruction: "preserve this work", target: { sessionId: "other", root: h.root, controllerId: "local", model: "test", accessMode: "ask" }, imageCount: 0 });
    expect((await h.post(PREPARE)).status).toBe(409);
    expect((await queue.list()).items).toHaveLength(1);
    expect((await h.post("/api/chat")).status).toBe(404);
  });

  it("checks detached company runs after their admitting request has returned", async () => {
    const h = await fixture();
    const finish = deferred();
    trackRun(h.home, "detached", finish.promise);
    const rejected = await h.post(PREPARE);
    finish.resolve();
    expect(rejected.status).toBe(409);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect((await h.post(PREPARE)).status).toBe(200);
  });

  it("does not let a stale lease cancel a subsequent preparation", async () => {
    const h = await fixture();
    const first = await (await h.post(PREPARE)).json() as { lease: string };
    await h.post(CANCEL, { lease: first.lease });
    const second = await (await h.post(PREPARE)).json() as { lease: string };
    expect(second.lease).not.toBe(first.lease);
    expect((await h.post(CANCEL, { lease: first.lease })).status).toBe(409);
    expect((await h.post("/api/chat")).status).toBe(409);
  });

  it("refuses malformed cancellation without releasing preparation", async () => {
    const h = await fixture();
    const prepared = await (await h.post(PREPARE)).json() as { lease: string };
    expect((await h.post(CANCEL, { lease: prepared.lease, extra: true })).status).toBe(400);
    expect((await h.post("/api/chat")).status).toBe(409);
  });

  it("responds to oversized cancellation without releasing the lease", async () => {
    const h = await fixture();
    await h.post(PREPARE);
    expect((await h.post(CANCEL, { lease: "x".repeat(512) })).status).toBe(400);
    expect((await h.post("/api/chat")).status).toBe(409);
  });

  it("fails closed on unreadable/corrupt queue evidence and releases its failed lease", async () => {
    const h = await fixture();
    const path = desktopTurnQueuePath(h.root, { VANTA_HOME: h.home });
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "not-json");
    expect((await h.post(PREPARE)).status).toBe(409);
    expect((await h.post("/api/chat")).status).toBe(404);
  });

  it("holds the admission freeze while queue readiness itself is awaiting", async () => {
    const h = await fixture();
    const reading = deferred();
    const finish = deferred();
    h.sessions.set("other", { root: h.root, _turnQueue: {
      list: async () => { reading.resolve(); await finish.promise; return { revision: 0, items: [] }; },
    } as unknown as DesktopTurnQueue });
    const pending = h.post(PREPARE);
    await reading.promise;
    const rejected = await h.post("/api/v1/admission");
    const duplicate = await h.post(PREPARE);
    finish.resolve();
    expect(rejected.status).toBe(409);
    expect(duplicate.status).toBe(409);
    expect((await pending).status).toBe(200);
    expect((await h.post("/api/chat")).status).toBe(409);
  });

  it("releases handler accounting on a rejected/throwing route", async () => {
    const h = await fixture();
    routes.run.mockRejectedValueOnce(new Error("fixture route failure"));
    expect((await h.post("/api/test-throw")).status).toBe(500);
    expect((await h.post(PREPARE)).status).toBe(200);
  });
});
