import { describe, it, expect } from "vitest";
import { resolveTeammateModel, teammateEnv } from "./teammate-model.js";
import { providerById } from "../providers/catalog.js";

// The strong-model map is private; mirror only the pairs we assert against the
// catalog so a drift (a strong model removed from a provider's list) trips a test.
const STRONG_PAIRS: Array<[provider: string, model: string]> = [
  ["openai", "gpt-5.6-sol"],
  ["anthropic", "claude-opus-4-8"],
  ["claude-code", "claude-opus-4-8"],
  ["gemini", "gemini-2.5-pro"],
  ["openrouter", "anthropic/claude-opus-4.1"],
  ["codex", "gpt-5.6-sol"],
  ["ollama", "llama3.3"],
];

describe("resolveTeammateModel", () => {
  it("returns the active model unchanged when VANTA_TEAMMATE_MODEL is unset (current behavior)", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-4o-mini" };
    expect(resolveTeammateModel(env, "gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("inherits the active model regardless of provider when unset", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "ollama" };
    expect(resolveTeammateModel(env, "qwen2.5:14b")).toBe("qwen2.5:14b");
  });

  it("falls back to the active model when the override is blank/whitespace", () => {
    expect(resolveTeammateModel({ VANTA_TEAMMATE_MODEL: "" }, "gpt-4o-mini")).toBe("gpt-4o-mini");
    expect(resolveTeammateModel({ VANTA_TEAMMATE_MODEL: "   " }, "gpt-4o-mini")).toBe("gpt-4o-mini");
  });

  it("honors an explicit operator override verbatim", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_TEAMMATE_MODEL: "gpt-4o" };
    expect(resolveTeammateModel(env, "gpt-4o-mini")).toBe("gpt-4o");
  });

  it("honors a free-typed off-catalog override (picker accepts free ids)", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_TEAMMATE_MODEL: "some-private-finetune" };
    expect(resolveTeammateModel(env, "gpt-4o-mini")).toBe("some-private-finetune");
  });

  it("trims surrounding whitespace from a real override", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_TEAMMATE_MODEL: "  gpt-4o  " };
    expect(resolveTeammateModel(env, "gpt-4o-mini")).toBe("gpt-4o");
  });

  describe("auto sentinel → the active provider's strongest model", () => {
    it.each(STRONG_PAIRS)("provider %s → %s", (provider, model) => {
      const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: provider, VANTA_TEAMMATE_MODEL: "auto" };
      expect(resolveTeammateModel(env, "weak-active")).toBe(model);
    });

    it("is case-insensitive on the sentinel", () => {
      const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_TEAMMATE_MODEL: "AUTO" };
      expect(resolveTeammateModel(env, "gpt-4o-mini")).toBe("gpt-5.6-sol");
    });

    it("defaults the provider to openai when VANTA_PROVIDER is unset", () => {
      const env: NodeJS.ProcessEnv = { VANTA_TEAMMATE_MODEL: "auto" };
      expect(resolveTeammateModel(env, "gpt-4o-mini")).toBe("gpt-5.6-sol");
    });

    it("falls back SAFELY to the active model for an unknown provider", () => {
      const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "totally-made-up", VANTA_TEAMMATE_MODEL: "auto" };
      expect(resolveTeammateModel(env, "deepseek-chat")).toBe("deepseek-chat");
    });

    it("falls back SAFELY for a real provider without a curated strong model", () => {
      // deepseek is a real catalogued provider but has no strong-model entry.
      const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "deepseek", VANTA_TEAMMATE_MODEL: "auto" };
      expect(resolveTeammateModel(env, "deepseek-chat")).toBe("deepseek-chat");
    });

    it("never returns empty under auto", () => {
      const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_TEAMMATE_MODEL: "auto" };
      expect(resolveTeammateModel(env, "gpt-4o-mini")).not.toBe("");
    });
  });

  // Provider-aware safety: every curated strong model MUST be a real model the
  // provider's catalog lists, else `auto` could resolve to an id the provider
  // can't serve.
  it.each(STRONG_PAIRS)("catalog lists the strong model for %s", (provider, model) => {
    const entry = providerById(provider);
    expect(entry, `provider ${provider} missing from catalog`).toBeDefined();
    expect(entry?.models).toContain(model);
  });
});

describe("teammateEnv", () => {
  it("sets VANTA_MODEL to the resolved teammate model", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_TEAMMATE_MODEL: "gpt-4o" };
    expect(teammateEnv(env, "gpt-4o-mini").VANTA_MODEL).toBe("gpt-4o");
  });

  it("is byte-identical in effect to the parent when the override is unset", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-4o-mini", OPENAI_API_KEY: "k" };
    const out = teammateEnv(env, "gpt-4o-mini");
    expect(out.VANTA_MODEL).toBe("gpt-4o-mini"); // inherited active model
    expect(out).toEqual(env); // every other key untouched
  });

  it("preserves all other env keys when overriding", () => {
    const env: NodeJS.ProcessEnv = { VANTA_PROVIDER: "openai", VANTA_TEAMMATE_MODEL: "gpt-4o", OPENAI_API_KEY: "k" };
    const out = teammateEnv(env, "gpt-4o-mini");
    expect(out.OPENAI_API_KEY).toBe("k");
    expect(out.VANTA_PROVIDER).toBe("openai");
  });
});
