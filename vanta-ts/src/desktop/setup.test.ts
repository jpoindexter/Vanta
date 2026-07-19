import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopServer } from "./server.js";
import { desktopSetupOptions, validateDesktopProviderSetup } from "./setup.js";
import { providerById } from "../providers/catalog.js";
import type { LLMProvider } from "../providers/interface.js";

const original = { provider: process.env.VANTA_PROVIDER, model: process.env.VANTA_MODEL };
afterEach(() => {
  if (original.provider === undefined) delete process.env.VANTA_PROVIDER; else process.env.VANTA_PROVIDER = original.provider;
  if (original.model === undefined) delete process.env.VANTA_MODEL; else process.env.VANTA_MODEL = original.model;
});

describe("desktop first-run setup", () => {
  it("exposes provider requirements without secrets", () => {
    const openai = desktopSetupOptions().find((provider) => provider.id === "openai");
    expect(openai).toMatchObject({ requiresKey: true, defaultModel: "gpt-5.6-sol" });
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

  it("rejects a placeholder key before writing project config", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-desktop-placeholder-"));
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server did not bind");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/setup`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai", model: "gpt-5.6-sol", apiKey: "sk-secret" }),
      });
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("looks like a placeholder");
      await expect(access(join(root, ".vanta", ".env"))).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });

  it("probes a credential before persistence and redacts provider errors", async () => {
    const provider = providerById("openai");
    if (!provider) throw new Error("OpenAI provider missing from test catalog");
    const key = "sk-proj-super-secret-value-123456789";
    const complete = vi.fn(async () => { throw new Error(`401 Incorrect API key provided: ${key}`); });
    const fake = { complete, modelId: () => "gpt-5.6-sol", contextWindow: () => 1 } as LLMProvider;
    await expect(validateDesktopProviderSetup(
      { provider, model: "gpt-5.6-sol", apiKey: key },
      {},
      { resolveProvider: () => fake },
    )).rejects.toSatisfy((error: Error) => error.message.includes("Could not verify") && !error.message.includes(key));
    expect(complete).toHaveBeenCalledOnce();
  });

  it("accepts a credential only after a successful provider probe", async () => {
    const provider = providerById("openai");
    if (!provider) throw new Error("OpenAI provider missing from test catalog");
    const complete = vi.fn(async () => ({ text: "OK", toolCalls: [], finishReason: "stop" }));
    const fake = { complete, modelId: () => "gpt-5.6-sol", contextWindow: () => 1 } as LLMProvider;
    await expect(validateDesktopProviderSetup(
      { provider, model: "gpt-5.6-sol", apiKey: "sk-proj-valid-fixture-key" },
      {},
      { resolveProvider: () => fake },
    )).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("probes a subscription login even though it has no API-key field", async () => {
    const provider = providerById("codex");
    if (!provider) throw new Error("Codex subscription provider missing from test catalog");
    const complete = vi.fn(async () => ({ text: "OK", toolCalls: [], finishReason: "stop" }));
    const fake = { complete, modelId: () => "gpt-5.6-sol", contextWindow: () => 1 } as LLMProvider;

    await expect(validateDesktopProviderSetup(
      { provider, model: "gpt-5.6-sol", apiKey: "" },
      {},
      { resolveProvider: () => fake },
    )).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalledOnce();
  });
});
