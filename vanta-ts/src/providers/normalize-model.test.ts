import { describe, it, expect } from "vitest";
import { normalizeModelForProvider, detectVendor } from "./normalize-model.js";
import { resolveProvider } from "./index.js";

// EXT-MODEL-NORMALIZE — id canonicalized for the target provider before the call.

describe("detectVendor", () => {
  it.each([
    ["gpt-4o", "openai"],
    ["o3-mini", "openai"],
    ["claude-sonnet-4.5", "anthropic"],
    ["gemini-2.5-flash", "google"],
    ["llama-3.3-70b", "meta-llama"],
    ["mixtral-8x7b", "mistralai"],
    ["qwen2.5-72b", "qwen"],
    ["deepseek-chat", "deepseek"],
    ["grok-4", "x-ai"],
  ])("maps %s → %s", (id, vendor) => {
    expect(detectVendor(id)).toBe(vendor);
  });

  it("returns null for an unknown bare id", () => {
    expect(detectVendor("some-local-model")).toBeNull();
  });
});

describe("normalizeModelForProvider", () => {
  it("OpenRouter: prepends the vendor to a bare id, leaves vendor/model alone", () => {
    expect(normalizeModelForProvider("openrouter", "claude-sonnet-4.5")).toBe("anthropic/claude-sonnet-4.5");
    expect(normalizeModelForProvider("openrouter", "gpt-4o")).toBe("openai/gpt-4o");
    expect(normalizeModelForProvider("openrouter", "anthropic/claude-sonnet-4.5")).toBe("anthropic/claude-sonnet-4.5");
    // Unknown vendor with no slash → left as-is (never fabricate a prefix).
    expect(normalizeModelForProvider("openrouter", "my-custom-model")).toBe("my-custom-model");
  });

  it("native providers: strip a known-vendor prefix down to the bare id", () => {
    expect(normalizeModelForProvider("openai", "openai/gpt-4o")).toBe("gpt-4o");
    expect(normalizeModelForProvider("anthropic", "anthropic/claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(normalizeModelForProvider("gemini", "google/gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("native providers: an already-bare id is unchanged", () => {
    expect(normalizeModelForProvider("openai", "gpt-4o")).toBe("gpt-4o");
    expect(normalizeModelForProvider("anthropic", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("does NOT strip an unrecognized namespace on a native provider (avoids harm)", () => {
    // A user-declared local model like "team/internal-7b" is left intact.
    expect(normalizeModelForProvider("openai", "team/internal-7b")).toBe("team/internal-7b");
  });

  it("freeform backends (ollama/custom) pass through untouched", () => {
    expect(normalizeModelForProvider("ollama", "qwen2.5:14b")).toBe("qwen2.5:14b");
    expect(normalizeModelForProvider("ollama", "hf.co/user/model:q4")).toBe("hf.co/user/model:q4");
    expect(normalizeModelForProvider("custom", "openai/gpt-4o")).toBe("openai/gpt-4o");
  });

  it("an unset model is passed through as undefined (factory default stands)", () => {
    expect(normalizeModelForProvider("openrouter", undefined)).toBeUndefined();
  });
});

describe("resolveProvider applies normalization end-to-end", () => {
  it("a bare id routed to OpenRouter reaches the provider as vendor/model", () => {
    const provider = resolveProvider({ VANTA_PROVIDER: "openrouter", OPENROUTER_API_KEY: "k", VANTA_MODEL: "claude-sonnet-4.5" });
    expect(provider.modelId()).toBe("anthropic/claude-sonnet-4.5");
  });

  it("an OpenRouter-shaped id routed to native OpenAI is stripped to the bare id", () => {
    const provider = resolveProvider({ VANTA_PROVIDER: "openai", OPENAI_API_KEY: "k", VANTA_MODEL: "openai/gpt-4o" });
    expect(provider.modelId()).toBe("gpt-4o");
  });

  it("leaves a correct id (and unset model) alone", () => {
    const p1 = resolveProvider({ VANTA_PROVIDER: "openai", OPENAI_API_KEY: "k", VANTA_MODEL: "gpt-4o-mini" });
    expect(p1.modelId()).toBe("gpt-4o-mini");
    const p2 = resolveProvider({ VANTA_PROVIDER: "ollama", VANTA_MODEL: "qwen2.5:14b" });
    expect(p2.modelId()).toBe("qwen2.5:14b");
  });
});
