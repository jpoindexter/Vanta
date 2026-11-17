import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectFallbackReadiness } from "./fallback-readiness.js";
import { resolveClaudeCodeToken } from "./claude-code-auth.js";
import { CodexProvider } from "./codex.js";

vi.mock("./claude-code-auth.js", () => ({
  resolveClaudeCodeToken: vi.fn((env: NodeJS.ProcessEnv) => {
    const token = env.CLAUDE_CODE_OAUTH_TOKEN?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim();
    if (!token) throw new Error("Credential stores forbidden in this test");
    return token;
  }),
}));
vi.mock("./codex.js", () => ({
  CodexProvider: vi.fn(() => { throw new Error("Credential stores forbidden in this test"); }),
}));

describe("static fallback configuration readiness", () => {
  let env: NodeJS.ProcessEnv;
  beforeEach(async () => {
    env = { VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-fallback-readiness-")) };
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:1/v1");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Model requests forbidden"));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("preserves order and duplicates while using real ordinary-provider resolution", () => {
    const rows = inspectFallbackReadiness({ ...env,
      VANTA_FALLBACK_PROVIDERS: " ollama, , unknown-provider, openai, OLLAMA, anthropic ",
      OPENAI_API_KEY: "synthetic-openai-key", ANTHROPIC_API_KEY: "synthetic-anthropic-key",
    });
    expect(rows.map(row => [row.index, row.provider, row.status])).toEqual([
      [1, "ollama", "configuration-resolved"], [2, "unknown-provider", "unavailable"],
      [3, "openai", "configuration-resolved"], [4, "ollama", "configuration-resolved"],
      [5, "anthropic", "configuration-resolved"],
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports missing keys, endpoint and custom model without leaking values or errors", async () => {
    await writeFile(join(env.VANTA_HOME!, "providers.json"), JSON.stringify({ providers: {
      private: { baseURL: "https://user:synthetic-secret@provider.test/v1?token=synthetic-secret", keyEnv: "PRIVATE_KEY" },
    } }));
    const rows = inspectFallbackReadiness({ ...env, VANTA_FALLBACK_PROVIDERS: "openai,custom,private,https://synthetic-secret@bad.test/\nsecret,sk-ant-synthetic-secret" });
    expect(rows.map(row => row.status)).toEqual(Array(5).fill("unavailable"));
    expect(JSON.stringify(rows)).not.toMatch(/synthetic-secret|provider\.test|bad\.test|PRIVATE_KEY|Unknown VANTA_PROVIDER/);
    expect(rows[3]?.provider).toBe("[redacted identifier]");
    expect(rows[4]?.provider).toBe("[redacted identifier]");
    expect(rows.every(row => row.detail.includes("vanta setup"))).toBe(true);
  });

  it("retains the shared model and user key requirements, including built-in overrides", async () => {
    await writeFile(join(env.VANTA_HOME!, "providers.json"), JSON.stringify({ providers: {
      codex: { baseURL: "http://127.0.0.1:1/v1", keyEnv: "CUSTOM_KEY" },
      "claude-code": { baseURL: "http://127.0.0.1:1/v1", model: "configured-model" },
    } }));
    const configured = { ...env, VANTA_FALLBACK_PROVIDERS: "codex,claude-code", CUSTOM_KEY: "synthetic-custom-key" };
    expect(inspectFallbackReadiness(configured).map(row => row.status)).toEqual(["unavailable", "configuration-resolved"]);
    expect(inspectFallbackReadiness({ ...configured, VANTA_MODEL: "shared-model" }).map(row => row.status))
      .toEqual(["configuration-resolved", "configuration-resolved"]);
    expect(inspectFallbackReadiness({ ...configured, VANTA_MODEL: "shared-model", CUSTOM_KEY: undefined })[0]?.status)
      .toBe("unavailable");
    expect(CodexProvider).not.toHaveBeenCalled();
    expect(resolveClaudeCodeToken).not.toHaveBeenCalled();
    expect(JSON.stringify(inspectFallbackReadiness(configured))).not.toContain("synthetic-custom-key");
  });

  it("skips all built-in subscription aliases rather than reading credentials", () => {
    const rows = inspectFallbackReadiness({ ...env, VANTA_FALLBACK_PROVIDERS: "codex,openai-codex,claude-code,claude-cli" });
    expect(rows.map(row => row.status)).toEqual(Array(4).fill("not-checked"));
    expect(CodexProvider).not.toHaveBeenCalled();
    expect(resolveClaudeCodeToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN"])("resolves Claude only with explicit %s", key => {
    const rows = inspectFallbackReadiness({ ...env, VANTA_FALLBACK_PROVIDERS: "claude-code,claude-cli", [key]: "synthetic-explicit-token" });
    expect(rows.map(row => row.status)).toEqual(["configuration-resolved", "configuration-resolved"]);
    expect(resolveClaudeCodeToken).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(rows)).not.toContain("synthetic-explicit-token");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not mistake blank tokens for permission to inspect credential stores", () => {
    expect(inspectFallbackReadiness({ ...env, VANTA_FALLBACK_PROVIDERS: "claude-code", CLAUDE_CODE_OAUTH_TOKEN: "  " })[0]?.status)
      .toBe("not-checked");
    expect(resolveClaudeCodeToken).not.toHaveBeenCalled();
  });

  it("returns no entries for an absent or empty fallback list", () => {
    expect(inspectFallbackReadiness(env)).toEqual([]);
    expect(inspectFallbackReadiness({ ...env, VANTA_FALLBACK_PROVIDERS: " ,  , " })).toEqual([]);
  });
});
