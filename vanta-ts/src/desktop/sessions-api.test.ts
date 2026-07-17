import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "./server.js";
import { loadSession, saveSession } from "../sessions/store.js";
import type { Message } from "../types.js";

const TRANSCRIPT: Message[] = [{ role: "user", content: "keep this transcript" }];

describe("desktop session management API", () => {
  let home: string;
  let root: string;
  const originalHome = process.env.VANTA_HOME;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-desktop-sessions-"));
    root = await mkdtemp(join(tmpdir(), "vanta-desktop-root-"));
    process.env.VANTA_HOME = home;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = originalHome;
    await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
  });

  it("renames, archives, restores, trashes, restores, and permanently deletes a persisted conversation", async () => {
    await saveSession("manage-me", TRANSCRIPT, { env: process.env, title: "Original title" });
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });

    try {
      expect((await post("/api/sessions/rename", { id: "manage-me", title: "Renamed session" })).status).toBe(200);
      expect((await post("/api/sessions/archive", { id: "manage-me", archived: true })).status).toBe(200);

      const archived = await (await fetch(`${base}/api/sessions`)).json() as Array<{ id: string; title: string; archived?: boolean }>;
      expect(archived).toMatchObject([{ id: "manage-me", title: "Renamed session", archived: true }]);

      expect((await post("/api/sessions/archive", { id: "manage-me", archived: false })).status).toBe(200);
      expect((await loadSession("manage-me", process.env))?.messages).toEqual(TRANSCRIPT);

      expect((await post("/api/sessions/delete", { id: "manage-me" })).status).toBe(200);
      const trashed = await (await fetch(`${base}/api/sessions`)).json() as Array<{ id: string; trashed?: boolean }>;
      expect(trashed).toMatchObject([{ id: "manage-me", trashed: true }]);
      const trashedSession = await loadSession("manage-me", process.env);
      expect(trashedSession?.trashed).toBe(true);
      expect(trashedSession?.archived).toBeUndefined();
      expect(trashedSession?.messages).toEqual(TRANSCRIPT);
      expect((await post("/api/sessions/delete", { id: "manage-me", trashed: false })).status).toBe(200);
      expect((await loadSession("manage-me", process.env))?.trashed).toBeUndefined();
      expect((await post("/api/sessions/delete", { id: "manage-me", permanent: true })).status).toBe(200);
      expect(await loadSession("manage-me", process.env)).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("pins sessions and persists an explicit active pinned order", async () => {
    await saveSession("pin-a", TRANSCRIPT, { env: process.env, title: "Pin A" });
    await saveSession("pin-b", TRANSCRIPT, { env: process.env, title: "Pin B" });
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });

    try {
      expect((await post("/api/sessions/pin", { id: "pin-a", pinned: true })).status).toBe(200);
      expect((await post("/api/sessions/pin", { id: "pin-b", pinned: true })).status).toBe(200);
      expect((await post("/api/sessions/reorder-pins", { orderedIds: ["pin-b", "pin-a"] })).status).toBe(200);
      expect(await loadSession("pin-b", process.env)).toMatchObject({ pinned: true, pinOrder: 0 });
      expect(await loadSession("pin-a", process.env)).toMatchObject({ pinned: true, pinOrder: 1 });
      expect((await post("/api/sessions/reorder-pins", { orderedIds: ["pin-a"] })).status).toBe(409);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects malformed session mutation requests", async () => {
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    try {
      const base = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${base}/api/sessions/rename`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "x", title: "  " }),
      });
      expect(response.status).toBe(400);
      const malformedTrash = await fetch(`${base}/api/sessions/delete`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "x", trashed: "yes" }),
      });
      expect(malformedTrash.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("clears the active desktop state when its persisted session moves to trash", async () => {
    await saveSession("active-delete", TRANSCRIPT, { env: process.env, title: "Active session" });
    const sessions = new Map([["active-browser", { root, sessionId: "active-delete", sessionStarted: "2026-07-13T00:00:00.000Z" }]]);
    const server = createDesktopServer(root, { sessions });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/sessions/delete`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-session-id": "active-browser" },
        body: JSON.stringify({ id: "active-delete" }),
      });
      expect(response.status).toBe(200);
      expect(sessions.get("active-browser")).toMatchObject({ root, sessionId: undefined, sessionStarted: undefined });
      expect(await loadSession("active-delete", process.env)).toMatchObject({ trashed: true, messages: TRANSCRIPT });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
