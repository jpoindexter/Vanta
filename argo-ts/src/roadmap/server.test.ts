import { describe, it, expect, afterEach } from "vitest";
import { createRoadmapServer } from "./server.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const FIXTURE = {
  updated: "2026-01-01",
  items: [
    { id: "T1", track: "Core", title: "Test item", status: "next", size: "S", summary: "A test item.", done: "Done when shipped." },
  ],
};

let dir: string;
let server: Server;
let baseUrl: string;

async function startServer(): Promise<void> {
  dir = await mkdtemp(join(tmpdir(), "argo-board-"));
  server = createRoadmapServer(dir);
  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("GET /roadmap/board", () => {
  it("returns 404 when roadmap.html does not exist", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/roadmap/board`);
    expect(res.status).toBe(404);
  });

  it("serves roadmap.html content", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.html"), "<html><body>board</body></html>", "utf8");
    const res = await fetch(`${baseUrl}/roadmap/board`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("board");
  });

  it("also responds at /", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.html"), "<html>ok</html>", "utf8");
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
  });
});

describe("POST /roadmap/move", () => {
  it("returns 400 for invalid JSON", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok: boolean };
    expect(j.ok).toBe(false);
  });

  it("returns 400 when id is missing", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "next" }),
    });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok: boolean; error: string };
    expect(j.ok).toBe(false);
    expect(j.error).toContain("id");
  });

  it("returns 400 for invalid status", async () => {
    await startServer();
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "T1", status: "bogus" }),
    });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok: boolean; error: string };
    expect(j.ok).toBe(false);
    expect(j.error).toContain("bogus");
  });

  it("moves an item and returns ok", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify(FIXTURE, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "T1", status: "building" }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; id: string; status: string };
    expect(j.ok).toBe(true);
    expect(j.id).toBe("T1");
    expect(j.status).toBe("building");
  });

  it("returns 400 when item id does not exist", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify(FIXTURE, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "NOPE", status: "next" }),
    });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok: boolean };
    expect(j.ok).toBe(false);
  });
});
