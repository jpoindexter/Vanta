import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopServer } from "./server.js";

describe("desktop runtime controller API", () => {
  const roots: string[] = [];
  const previousHosts = process.env.VANTA_RUNTIME_HOSTS;
  afterEach(async () => {
    if (previousHosts === undefined) delete process.env.VANTA_RUNTIME_HOSTS;
    else process.env.VANTA_RUNTIME_HOSTS = previousHosts;
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("lists runtime hosts and preserves a selected host for the desktop session", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-desktop-runtime-api-"));
    roots.push(root);
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    process.env.VANTA_RUNTIME_HOSTS = JSON.stringify([{ id: "remote-a", label: "Remote A", kind: "remote", endpoint: base }]);
    const headers = { "x-session-id": "runtime-session", "content-type": "application/json" };

    try {
      const initial = await fetch(`${base}/api/runtime`, { headers }).then((response) => response.json()) as { selectedHostId: string; hosts: Array<{ host: { id: string } }> };
      expect(initial.selectedHostId).toBe("local");
      expect(initial.hosts.map((host) => host.host.id)).toEqual(["local", "remote-a"]);

      const savedResponse = await fetch(`${base}/api/runtime`, { method: "POST", headers, body: JSON.stringify({ hostId: "remote-a" }) });
      expect(savedResponse.status).toBe(200);
      expect(await savedResponse.json()).toMatchObject({ selectedHostId: "remote-a" });
      expect(await fetch(`${base}/api/runtime`, { headers }).then((response) => response.json())).toMatchObject({ selectedHostId: "remote-a" });

      const reconnected = await fetch(`${base}/api/runtime`, { method: "POST", headers, body: JSON.stringify({ hostId: "remote-a", action: "reconnect" }) });
      expect(reconnected.status).toBe(200);
      expect(await reconnected.json()).toMatchObject({ selectedHostId: "remote-a" });

      const invalidAction = await fetch(`${base}/api/runtime`, { method: "POST", headers, body: JSON.stringify({ hostId: "remote-a", action: "destroy" }) });
      expect(invalidAction.status).toBe(400);

      const rejected = await fetch(`${base}/api/runtime`, { method: "POST", headers, body: JSON.stringify({ hostId: "missing" }) });
      expect(rejected.status).toBe(400);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
