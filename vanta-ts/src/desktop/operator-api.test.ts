import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "./server.js";

describe("desktop operator routes", () => {
  let home = "";
  let root = "";
  const originalHome = process.env.VANTA_HOME;
  const originalTelegram = process.env.VANTA_TELEGRAM_TOKEN;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-operator-api-home-"));
    root = await mkdtemp(join(tmpdir(), "vanta-operator-api-root-"));
    process.env.VANTA_HOME = home;
    delete process.env.VANTA_TELEGRAM_TOKEN;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = originalHome;
    if (originalTelegram === undefined) delete process.env.VANTA_TELEGRAM_TOKEN; else process.env.VANTA_TELEGRAM_TOKEN = originalTelegram;
    await Promise.all([rm(home, { recursive: true, force: true }), rm(root, { recursive: true, force: true })]);
  });

  it("lists real adapters and persists a selected adapter through the desktop API", async () => {
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const adapters = await (await fetch(`${base}/api/messaging`)).json() as Array<{ id: string; configured: boolean }>;
      expect(adapters.find((adapter) => adapter.id === "telegram")).toMatchObject({ configured: false });
      const saved = await fetch(`${base}/api/messaging`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "telegram", values: { VANTA_TELEGRAM_TOKEN: "desktop-token" } }) });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ id: "telegram", configured: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
