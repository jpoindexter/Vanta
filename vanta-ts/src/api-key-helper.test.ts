import { describe, it, expect, beforeEach } from "vitest";
import { runApiKeyHelper, getCachedApiKey, prefetchApiKeyHelper } from "./api-key-helper.js";

describe("runApiKeyHelper", () => {
  it("returns trimmed stdout on exit 0", async () => {
    const key = await runApiKeyHelper("echo sk-test-key");
    expect(key).toBe("sk-test-key");
  });

  it("rejects on non-zero exit", async () => {
    await expect(runApiKeyHelper("exit 1")).rejects.toThrow(/exited 1/);
  });

  it("includes stderr in the rejection message", async () => {
    await expect(runApiKeyHelper("echo 'bad key' >&2; exit 2")).rejects.toThrow(/bad key/);
  });
});

describe("getCachedApiKey", () => {
  beforeEach(() => {
    // Clear the module-level cache between tests by using a unique command each time.
  });

  it("returns the key from the command", async () => {
    const key = await getCachedApiKey(`echo cache-test-${Math.random()}`);
    expect(key).toMatch(/^cache-test-/);
  });

  it("caches the result for subsequent calls with the same command", async () => {
    const cmd = "echo cached-value";
    const first = await getCachedApiKey(cmd, 60_000);
    const second = await getCachedApiKey(cmd, 60_000);
    expect(first).toBe("cached-value");
    expect(second).toBe("cached-value");
  });

  it("re-runs the command after TTL expires", async () => {
    const cmd = "echo ttl-value";
    await getCachedApiKey(cmd, 0); // ttl = 0ms → immediately expired
    const second = await getCachedApiKey(cmd, 0);
    expect(second).toBe("ttl-value");
  });
});

describe("prefetchApiKeyHelper", () => {
  it("injects the key into the env var for the active provider", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "anthropic" };
    await prefetchApiKeyHelper({ api_key_helper: "echo sk-anthropic-test" }, env);
    expect(env.ANTHROPIC_API_KEY).toBe("sk-anthropic-test");
  });

  it("does not overwrite an already-set key", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "existing" };
    await prefetchApiKeyHelper({ api_key_helper: "echo sk-new" }, env);
    expect(env.ANTHROPIC_API_KEY).toBe("existing");
  });

  it("does nothing when api_key_helper is not set", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "anthropic" };
    await prefetchApiKeyHelper({}, env);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("defaults to openai provider when VANTA_PROVIDER is unset", async () => {
    const env: NodeJS.ProcessEnv = {};
    await prefetchApiKeyHelper({ api_key_helper: "echo sk-openai" }, env);
    expect(env.OPENAI_API_KEY).toBe("sk-openai");
  });

  it("handles openrouter (shares OPENAI_API_KEY env var)", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openrouter" };
    await prefetchApiKeyHelper({ api_key_helper: "echo sk-router" }, env);
    expect(env.OPENAI_API_KEY).toBe("sk-router");
  });

  it("does not throw on a failing helper — best-effort", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "anthropic" };
    await expect(prefetchApiKeyHelper({ api_key_helper: "exit 99" }, env)).resolves.toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("ignores unknown providers silently", async () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "unknown-provider" };
    await prefetchApiKeyHelper({ api_key_helper: "echo key" }, env);
    // no env var set, no error
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });
});
