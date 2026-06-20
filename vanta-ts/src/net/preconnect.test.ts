import { describe, it, expect, vi } from "vitest";
import { providerApiHost, preconnect, preconnectStartup, type ApiHost, type Connect } from "./preconnect.js";

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("providerApiHost", () => {
  it("defaults to api.openai.com:443 when VANTA_PROVIDER is unset", () => {
    expect(providerApiHost(env())).toEqual({ host: "api.openai.com", port: 443 });
  });

  it("resolves the anthropic host", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "anthropic" }))).toEqual({ host: "api.anthropic.com", port: 443 });
  });

  it("maps claude-code (OAuth subscription) to the anthropic host", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "claude-code" }))).toEqual({ host: "api.anthropic.com", port: 443 });
  });

  it("maps codex to the OpenAI host", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "codex" }))).toEqual({ host: "api.openai.com", port: 443 });
  });

  it("resolves an OpenAI-compatible cloud provider's host", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "openrouter" }))).toEqual({ host: "openrouter.ai", port: 443 });
  });

  it("is case-insensitive on the provider id", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "Anthropic" }))).toEqual({ host: "api.anthropic.com", port: 443 });
  });

  it("returns null for a local Ollama backend", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "ollama" }))).toBeNull();
  });

  it("returns null for a local LM Studio backend", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "lmstudio" }))).toBeNull();
  });

  it("returns null for an unknown provider id", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "nope-not-real" }))).toBeNull();
  });

  it("resolves a custom OpenAI-compatible endpoint from VANTA_OPENAI_BASE_URL", () => {
    const host = providerApiHost(env({ VANTA_PROVIDER: "custom", VANTA_OPENAI_BASE_URL: "https://api.example.com:8443/v1" }));
    expect(host).toEqual({ host: "api.example.com", port: 8443 });
  });

  it("returns null for custom when no base URL is configured", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "custom" }))).toBeNull();
  });

  it("returns null when a custom endpoint points at localhost", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "custom", VANTA_OPENAI_BASE_URL: "http://127.0.0.1:1234/v1" }))).toBeNull();
  });

  it("resolves the Azure endpoint host", () => {
    const host = providerApiHost(env({ VANTA_PROVIDER: "azure", AZURE_OPENAI_ENDPOINT: "https://my-resource.openai.azure.com/" }));
    expect(host).toEqual({ host: "my-resource.openai.azure.com", port: 443 });
  });

  it("returns null for an unparseable custom URL", () => {
    expect(providerApiHost(env({ VANTA_PROVIDER: "custom", VANTA_OPENAI_BASE_URL: "::not a url::" }))).toBeNull();
  });
});

describe("preconnect", () => {
  const HOST: ApiHost = { host: "api.openai.com", port: 443 };

  it("calls connect with the resolved host when enabled", async () => {
    const connect = vi.fn<Connect>().mockResolvedValue(undefined);
    const result = await preconnect({ env: env({ VANTA_PRECONNECT: "1", VANTA_PROVIDER: "openai" }), connect });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(HOST);
    expect(result).toEqual({ ok: true, warmed: true, host: HOST });
  });

  it("uses an injected host over env resolution", async () => {
    const injected: ApiHost = { host: "api.anthropic.com", port: 443 };
    const connect = vi.fn<Connect>().mockResolvedValue(undefined);
    await preconnect({ env: env({ VANTA_PRECONNECT: "1", VANTA_PROVIDER: "openai" }), host: injected, connect });
    expect(connect).toHaveBeenCalledWith(injected);
  });

  it("does NOT connect when disabled (off by default)", async () => {
    const connect = vi.fn<Connect>().mockResolvedValue(undefined);
    const result = await preconnect({ env: env({ VANTA_PROVIDER: "openai" }), connect });
    expect(connect).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, warmed: false, reason: "disabled" });
  });

  it("does NOT connect when the host is unknown/local even if enabled", async () => {
    const connect = vi.fn<Connect>().mockResolvedValue(undefined);
    const result = await preconnect({ env: env({ VANTA_PRECONNECT: "1", VANTA_PROVIDER: "ollama" }), connect });
    expect(connect).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, warmed: false, reason: "no-host" });
  });

  it("does NOT connect when an injected host is null", async () => {
    const connect = vi.fn<Connect>().mockResolvedValue(undefined);
    const result = await preconnect({ env: env({ VANTA_PRECONNECT: "1" }), host: null, connect });
    expect(connect).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, warmed: false, reason: "no-host" });
  });

  it("swallows a thrown connect and never throws", async () => {
    const connect = vi.fn<Connect>().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await preconnect({ env: env({ VANTA_PRECONNECT: "1", VANTA_PROVIDER: "openai" }), connect });
    expect(result).toEqual({ ok: false, warmed: false, reason: "connect-failed", error: "ECONNREFUSED" });
  });

  it("swallows a synchronously-thrown non-Error connect", async () => {
    const connect: Connect = () => {
      throw "boom";
    };
    const result = await preconnect({ env: env({ VANTA_PRECONNECT: "1", VANTA_PROVIDER: "openai" }), connect });
    expect(result).toEqual({ ok: false, warmed: false, reason: "connect-failed", error: "boom" });
  });

  it("honors truthy VANTA_PRECONNECT spellings", async () => {
    for (const v of ["1", "true", "yes", "on", "TRUE"]) {
      const connect = vi.fn<Connect>().mockResolvedValue(undefined);
      await preconnect({ env: env({ VANTA_PRECONNECT: v, VANTA_PROVIDER: "openai" }), connect });
      expect(connect).toHaveBeenCalledTimes(1);
    }
  });

  it("treats a non-truthy VANTA_PRECONNECT as off", async () => {
    const connect = vi.fn<Connect>().mockResolvedValue(undefined);
    const result = await preconnect({ env: env({ VANTA_PRECONNECT: "0", VANTA_PROVIDER: "openai" }), connect });
    expect(connect).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, warmed: false, reason: "disabled" });
  });
});

describe("preconnectStartup (fire-and-forget wiring)", () => {
  it("resolves the host from env and warms it through the injected connector", async () => {
    const connect = vi.fn<Connect>().mockResolvedValue(undefined);
    const result = await preconnectStartup(env({ VANTA_PRECONNECT: "1", VANTA_PROVIDER: "anthropic" }), connect);
    expect(connect).toHaveBeenCalledWith({ host: "api.anthropic.com", port: 443 });
    expect(result).toEqual({ ok: true, warmed: true, host: { host: "api.anthropic.com", port: 443 } });
  });

  it("is a no-op (no connect) when disabled — the default-off startup case", async () => {
    const connect = vi.fn<Connect>().mockResolvedValue(undefined);
    const result = await preconnectStartup(env({ VANTA_PROVIDER: "openai" }), connect);
    expect(connect).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, warmed: false, reason: "disabled" });
  });

  it("never throws when the connector fails — startup is unaffected", async () => {
    const connect = vi.fn<Connect>().mockRejectedValue(new Error("network down"));
    await expect(
      preconnectStartup(env({ VANTA_PRECONNECT: "1", VANTA_PROVIDER: "openai" }), connect),
    ).resolves.toEqual({ ok: false, warmed: false, reason: "connect-failed", error: "network down" });
  });
});
