import { describe, it, expect } from "vitest";
import { resolveProvider } from "./index.js";

describe("resolveProvider", () => {
  it("resolves gemini via GEMINI_API_KEY with the default flash model", () => {
    const p = resolveProvider({ ARGO_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(p.modelId()).toBe("gemini-2.5-flash");
    expect(p.contextWindow()).toBe(1_000_000);
  });

  it("accepts GOOGLE_API_KEY as a gemini key fallback", () => {
    const p = resolveProvider({ ARGO_PROVIDER: "gemini", GOOGLE_API_KEY: "k" });
    expect(p.modelId()).toBe("gemini-2.5-flash");
  });

  it("honors ARGO_MODEL for gemini", () => {
    const p = resolveProvider({
      ARGO_PROVIDER: "gemini",
      GEMINI_API_KEY: "k",
      ARGO_MODEL: "gemini-2.5-pro",
    });
    expect(p.modelId()).toBe("gemini-2.5-pro");
  });

  it("throws an actionable error when the gemini key is missing", () => {
    expect(() => resolveProvider({ ARGO_PROVIDER: "gemini" })).toThrow(
      /GEMINI_API_KEY is not set.*argo setup/s,
    );
  });

  it("resolves openrouter via OPENROUTER_API_KEY", () => {
    const p = resolveProvider({
      ARGO_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "k",
    });
    expect(p.modelId()).toBe("anthropic/claude-sonnet-4.5");
  });

  it("throws an actionable error when the openrouter key is missing", () => {
    expect(() => resolveProvider({ ARGO_PROVIDER: "openrouter" })).toThrow(
      /OPENROUTER_API_KEY is not set.*argo setup/s,
    );
  });

  it("rejects an unknown provider naming the valid options", () => {
    expect(() => resolveProvider({ ARGO_PROVIDER: "bogus" })).toThrow(
      /Unknown ARGO_PROVIDER.*gemini.*openrouter/s,
    );
  });
});
