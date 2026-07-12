import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopServer } from "./server.js";
import { desktopSetupOptions } from "./setup.js";

const original = { provider: process.env.VANTA_PROVIDER, model: process.env.VANTA_MODEL };
afterEach(() => {
  if (original.provider === undefined) delete process.env.VANTA_PROVIDER; else process.env.VANTA_PROVIDER = original.provider;
  if (original.model === undefined) delete process.env.VANTA_MODEL; else process.env.VANTA_MODEL = original.model;
});

describe("desktop first-run setup", () => {
  it("exposes provider requirements without secrets", () => {
    const openai = desktopSetupOptions().find((provider) => provider.id === "openai");
    expect(openai).toMatchObject({ requiresKey: true, defaultModel: "gpt-4o-mini" });
    expect(JSON.stringify(openai)).not.toContain("OPENAI_API_KEY");
  });

  it("writes a private project config through the real desktop route", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-desktop-setup-"));
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/setup`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "ollama", model: "llama3.3" }),
    });
    expect(response.status).toBe(200);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(readFile(join(root, ".vanta", ".env"), "utf8")).resolves.toContain("VANTA_PROVIDER=ollama");
  });
});
