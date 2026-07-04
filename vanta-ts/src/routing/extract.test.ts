import { describe, it, expect } from "vitest";
import { extractEnv, DEFAULT_EXTRACT_TIMEOUT_SEC } from "./extract.js";

describe("extractEnv", () => {
  it("model/provider unchanged when VANTA_EXTRACT_MODEL is unset — only the timeout is added", () => {
    const env = { VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-5" };
    const out = extractEnv(env);
    expect(out.VANTA_PROVIDER).toBe("openai");
    expect(out.VANTA_MODEL).toBe("gpt-5");
    expect(out.VANTA_PROVIDER_TIMEOUT_SEC).toBe(String(DEFAULT_EXTRACT_TIMEOUT_SEC));
  });

  it("swaps VANTA_MODEL to the extract model, keeping the active provider", () => {
    const env = {
      VANTA_PROVIDER: "openrouter",
      VANTA_MODEL: "anthropic/claude-sonnet-4",
      VANTA_EXTRACT_MODEL: "gpt-4o-mini",
    };
    const out = extractEnv(env);
    expect(out.VANTA_MODEL).toBe("gpt-4o-mini");
    expect(out.VANTA_PROVIDER).toBe("openrouter");
  });

  it("swaps both model and provider when VANTA_EXTRACT_PROVIDER is set", () => {
    const env = {
      VANTA_PROVIDER: "ollama",
      VANTA_MODEL: "qwen2.5:14b",
      VANTA_EXTRACT_MODEL: "gpt-4o-mini",
      VANTA_EXTRACT_PROVIDER: "openai",
    };
    const out = extractEnv(env);
    expect(out.VANTA_MODEL).toBe("gpt-4o-mini");
    expect(out.VANTA_PROVIDER).toBe("openai");
  });

  it("defaults the request timeout to 360s (Hermes' documented default)", () => {
    const env = { VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-5" };
    expect(extractEnv(env).VANTA_PROVIDER_TIMEOUT_SEC).toBe("360");
  });

  it("honors an explicit VANTA_EXTRACT_TIMEOUT_SEC override", () => {
    const env = { VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-5", VANTA_EXTRACT_TIMEOUT_SEC: "120" };
    expect(extractEnv(env).VANTA_PROVIDER_TIMEOUT_SEC).toBe("120");
  });

  it("the independent timeout applies EVEN when using the main model (no aux swap)", () => {
    // The main model might run with a tight VANTA_PROVIDER_TIMEOUT_SEC tuned for
    // snappy interactive chat; extraction still gets its own, more generous budget.
    const env = { VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-5", VANTA_PROVIDER_TIMEOUT_SEC: "30" };
    expect(extractEnv(env).VANTA_PROVIDER_TIMEOUT_SEC).toBe("360");
  });

  it("does not mutate the input env", () => {
    const env = {
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-5",
      VANTA_EXTRACT_MODEL: "gpt-4o-mini",
    };
    const copy = { ...env };
    extractEnv(env);
    expect(env).toEqual(copy);
  });
});
