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
  dir = await mkdtemp(join(tmpdir(), "vanta-board-"));
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

  it("returns 409 when a board move skips open after dependencies", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify({
      updated: "2026-01-01",
      items: [
        { id: "FOUNDATION", track: "Core", title: "Foundation", status: "next", size: "S", summary: ".", done: "." },
        { id: "LAUNCH", track: "Core", title: "Launch", status: "next", size: "S", summary: ".", done: ".", after: ["FOUNDATION"] },
      ],
    }, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "LAUNCH", status: "building" }),
    });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { ok: boolean; error: string; dependencies: string[] };
    expect(j.ok).toBe(false);
    expect(j.dependencies).toEqual(["FOUNDATION (next)"]);
    expect(j.error).toContain("--force");
  });

  it("allows a board dependency override with force", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify({
      updated: "2026-01-01",
      items: [
        { id: "FOUNDATION", track: "Core", title: "Foundation", status: "next", size: "S", summary: ".", done: "." },
        { id: "LAUNCH", track: "Core", title: "Launch", status: "next", size: "S", summary: ".", done: ".", after: ["FOUNDATION"] },
      ],
    }, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "LAUNCH", status: "building", force: true }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 409 when a board move revives a parked card without force", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify({
      updated: "2026-01-01",
      items: [
        { id: "PROOF", track: "Core", title: "Proof", status: "parked", size: "S", summary: ".", done: ".", parkedReason: "external proof" },
      ],
    }, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "PROOF", status: "building" }),
    });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { ok: boolean; error: string; parkedReason: string };
    expect(j.ok).toBe(false);
    expect(j.parkedReason).toBe("external proof");
    expect(j.error).toContain("requires review before revival");
  });

  it("allows a forced board revive for a parked card", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify({
      updated: "2026-01-01",
      items: [
        { id: "PROOF", track: "Core", title: "Proof", status: "parked", size: "S", summary: ".", done: ".", parkedReason: "external proof" },
      ],
    }, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "PROOF", status: "building", force: true }),
    });
    expect(res.status).toBe(200);
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

const AT_LIMIT_FIXTURE = {
  updated: "2026-01-01",
  items: [
    { id: "T1", track: "Core", title: "A", status: "building", size: "S", summary: ".", done: "." },
    { id: "T2", track: "Core", title: "B", status: "building", size: "S", summary: ".", done: "." },
    { id: "T3", track: "Core", title: "C", status: "next",     size: "S", summary: ".", done: "." },
  ],
};

describe("POST /roadmap/move — WIP limit", () => {
  it("returns 409 with wip payload when limit would be exceeded", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify(AT_LIMIT_FIXTURE, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "T3", status: "building" }),
    });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { ok: boolean; error: string; wip: { count: number; limit: number } };
    expect(j.ok).toBe(false);
    expect(j.wip.count).toBe(2);
    expect(j.wip.limit).toBe(2);
  });

  it("409 error message references finish or park", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify(AT_LIMIT_FIXTURE, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "T3", status: "building" }),
    });
    const j = (await res.json()) as { ok: boolean; error: string };
    expect(j.error).toMatch(/shipped|park|finish/i);
  });

  it("returns 200 when first item enters an empty building column", async () => {
    await startServer();
    const data = {
      updated: "2026-01-01",
      items: [{ id: "T1", track: "Core", title: "A", status: "next", size: "S", summary: ".", done: "." }],
    };
    await writeFile(join(dir, "roadmap.json"), JSON.stringify(data, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "T1", status: "building" }),
    });
    expect(res.status).toBe(200);
  });

  it("allows moving a building item out (to shipped) when at limit", async () => {
    await startServer();
    await writeFile(join(dir, "roadmap.json"), JSON.stringify(AT_LIMIT_FIXTURE, null, 2), "utf8");
    const res = await fetch(`${baseUrl}/roadmap/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "T1", status: "shipped" }),
    });
    expect(res.status).toBe(200);
  });
});
