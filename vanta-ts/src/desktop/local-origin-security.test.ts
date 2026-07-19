import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopServer } from "./server.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("desktop local-origin boundary", () => {
  it("denies hostile reads and mutations while trusted Work and connector routes pass", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-origin-proof-"));
    roots.push(root);
    const token = "a".repeat(64);
    const server = createDesktopServer(root, { boundaryToken: token });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("security proof server did not bind");
      const base = `http://127.0.0.1:${address.port}`;
      const trusted = { "x-vanta-desktop-boundary": token };
      const initialResponse = await fetch(`${base}/api/sessions`, { headers: trusted });
      expect(initialResponse.status).toBe(200);
      const initialSessions = await initialResponse.json() as unknown[];

      const draftBody = JSON.stringify({ action: "save", id: "security-proof", value: "trusted draft" });
      for (const pathname of ["/api/status", "/api/sessions", "/api/files", "/api/approval", "/api/connect/mcp"]) {
        await expect(fetch(`${base}${pathname}`), `hostile read ${pathname}`).resolves.toMatchObject({ status: 403 });
      }
      for (const [pathname, body] of [
        ["/api/chat", JSON.stringify({ message: "write a file" })],
        ["/api/terminal", JSON.stringify({ command: "touch hostile" })],
        ["/api/approval", JSON.stringify({ id: "pending", decision: "allow" })],
        ["/api/messaging", JSON.stringify({ id: "telegram", values: { token: "hostile" } })],
        ["/api/connect/mcp", JSON.stringify({ action: "trust", name: "hostile" })],
        ["/api/sessions/draft", draftBody],
      ]) {
        await expect(fetch(`${base}${pathname}`, { method: "POST", headers: { "content-type": "application/json" }, body }), `hostile mutation ${pathname}`).resolves.toMatchObject({ status: 403 });
      }
      await expect(fetch(`${base}/api/sessions/draft`, { method: "POST", headers: { "content-type": "application/json", "x-vanta-desktop-boundary": "b".repeat(64) }, body: draftBody })).resolves.toMatchObject({ status: 403 });
      await expect(fetch(`${base}/api/sessions/draft`, { method: "POST", headers: { "content-type": "application/json", ...trusted, origin: "http://127.0.0.1:65500" }, body: draftBody })).resolves.toMatchObject({ status: 403 });
      await expect(fetch(`${base}/api/sessions`, { method: "DELETE", headers: trusted })).resolves.toMatchObject({ status: 405 });

      const unchanged = await fetch(`${base}/api/sessions`, { headers: trusted });
      expect(unchanged.status).toBe(200);
      expect(await unchanged.json()).toHaveLength(initialSessions.length);
      const untouchedDraft = await fetch(`${base}/api/sessions/draft`, { method: "POST", headers: { "content-type": "application/json", ...trusted }, body: JSON.stringify({ action: "load", id: "security-proof" }) });
      expect(await untouchedDraft.json()).toEqual({ exists: false, value: "" });

      const work = await fetch(`${base}/api/sessions/draft`, { method: "POST", headers: { "content-type": "application/json", ...trusted }, body: draftBody });
      expect(work.status).toBe(200);
      expect(await work.json()).toEqual({ saved: true });

      const connector = await fetch(`${base}/api/connect/google`, { headers: trusted });
      expect(connector.status).toBe(200);

      const companion = await fetch(`${base}/api/companion/info`);
      expect(companion.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
