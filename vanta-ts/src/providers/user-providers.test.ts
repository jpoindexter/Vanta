import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUserProviders, makeUserProvider } from "./user-providers.js";
import { resolveProvider } from "./index.js";

let home: string;
function env(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { VANTA_HOME: home, ...extra } as NodeJS.ProcessEnv;
}
function writeProviders(obj: unknown): void {
  writeFileSync(join(home, "providers.json"), JSON.stringify(obj));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-userprov-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("loadUserProviders", () => {
  it("returns {} when the file is missing", () => {
    expect(loadUserProviders(env())).toEqual({});
  });

  it("returns {} on malformed JSON", () => {
    writeFileSync(join(home, "providers.json"), "{ not json");
    expect(loadUserProviders(env())).toEqual({});
  });

  it("loads a valid entry and lowercases the id", () => {
    writeProviders({ providers: { TokenRouter: { baseURL: "https://api.tokenrouter.com/v1", keyEnv: "TOKENROUTER_API_KEY", model: "MiniMax-M3", router: true } } });
    expect(loadUserProviders(env())).toEqual({
      tokenrouter: { baseURL: "https://api.tokenrouter.com/v1", keyEnv: "TOKENROUTER_API_KEY", model: "MiniMax-M3", router: true },
    });
  });

  it("drops an entry without a valid http(s) baseURL", () => {
    writeProviders({ providers: { bad: { keyEnv: "X" }, ftp: { baseURL: "ftp://x" }, ok: { baseURL: "http://localhost:8000/v1" } } });
    expect(Object.keys(loadUserProviders(env()))).toEqual(["ok"]);
  });
});

describe("makeUserProvider", () => {
  it("builds a provider when the key env is set", () => {
    const p = makeUserProvider(env({ NV_KEY: "nvapi-abc" }), "nv", { baseURL: "https://integrate.api.nvidia.com/v1", keyEnv: "NV_KEY", model: "deepseek-ai/deepseek-r1" });
    expect(p.modelId()).toBe("deepseek-ai/deepseek-r1");
  });

  it("throws a clear error when the declared key env is missing", () => {
    expect(() => makeUserProvider(env(), "nv", { baseURL: "https://x/v1", keyEnv: "NV_KEY", model: "m" })).toThrow(/NV_KEY is not set/);
  });

  it("throws when no model is resolvable", () => {
    expect(() => makeUserProvider(env(), "nv", { baseURL: "https://x/v1", keyEnv: undefined })).toThrow(/No model for provider "nv"/);
  });

  it("allows a keyless local endpoint", () => {
    const p = makeUserProvider(env(), "lan", { baseURL: "http://192.168.1.5:8000/v1", model: "qwen2.5:32b" });
    expect(p.modelId()).toBe("qwen2.5:32b");
  });

  it("lets VANTA_MODEL override the declared model", () => {
    const p = makeUserProvider(env({ K: "k", VANTA_MODEL: "openai/gpt-4o" }), "r", { baseURL: "https://x/v1", keyEnv: "K", model: "default" });
    expect(p.modelId()).toBe("openai/gpt-4o");
  });
});

describe("resolveProvider integration", () => {
  it("resolves a user-declared provider via VANTA_PROVIDER", () => {
    writeProviders({ providers: { myrouter: { baseURL: "https://api.tokenrouter.com/v1", keyEnv: "MR_KEY", model: "MiniMax-M3" } } });
    const p = resolveProvider(env({ VANTA_PROVIDER: "myrouter", MR_KEY: "sk-x" }));
    expect(p.modelId()).toBe("MiniMax-M3");
  });

  it("a user entry wins over a built-in of the same id", () => {
    writeProviders({ providers: { openai: { baseURL: "https://my-proxy/v1", keyEnv: "P_KEY", model: "proxied-model" } } });
    const p = resolveProvider(env({ VANTA_PROVIDER: "openai", P_KEY: "sk-x" }));
    expect(p.modelId()).toBe("proxied-model");
  });
});
