import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { startCompanionPairing } from "./auth.js";
import { createDesktopServer } from "../desktop/server.js";

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))));

describe("companion LAN server", () => {
  it("blocks desktop APIs and requires pairing for the narrow companion API", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-companion-server-")); homes.push(home);
    const repoRoot = join(process.cwd(), "..");
    const server = createDesktopServer(repoRoot, { enabled: true, home, port: 0, isLoopback: () => false });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const remote = `http://127.0.0.1:${port}`;
      expect((await fetch(`${remote}/api/terminal`)).status).toBe(403);
      expect((await fetch(`${remote}/api/companion/approval`)).status).toBe(401);
      expect((await fetch(`${remote}/companion`)).status).toBe(200);
      const preflight = await fetch(`${remote}/api/companion/status`, { method: "OPTIONS", headers: { origin: "capacitor://localhost" } });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");

      const { code } = await startCompanionPairing(home);
      const paired = await fetch(`${remote}/api/companion/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, name: "Test phone" }) });
      const { token } = await paired.json() as { token: string };
      expect(token.length).toBeGreaterThan(40);
      const approval = await fetch(`${remote}/api/companion/approval`, { headers: { authorization: `Bearer ${token}` } });
      expect(approval.status).toBe(200);
      expect(await approval.json()).toBeNull();
      const sessions = await fetch(`${remote}/api/companion/sessions`, { headers: { authorization: `Bearer ${token}`, origin: "capacitor://localhost" } });
      expect(sessions.status).toBe(200);
      expect(sessions.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
      const controller = new AbortController();
      const events = await fetch(`${remote}/api/companion/events`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
      expect(events.status).toBe(200);
      expect(events.headers.get("content-type")).toContain("text/event-stream");
      controller.abort();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
