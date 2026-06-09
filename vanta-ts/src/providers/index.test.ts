import { describe, it, expect } from "vitest";
import { resolveProvider } from "./index.js";

describe("resolveProvider", () => {
  it("resolves gemini via GEMINI_API_KEY with the default flash model", () => {
    const p = resolveProvider({ VANTA_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(p.modelId()).toBe("gemini-2.5-flash");
    expect(p.contextWindow()).toBe(1_000_000);
  });

  it("accepts GOOGLE_API_KEY as a gemini key fallback", () => {
    const p = resolveProvider({ VANTA_PROVIDER: "gemini", GOOGLE_API_KEY: "k" });
    expect(p.modelId()).toBe("gemini-2.5-flash");
  });

  it("honors VANTA_MODEL for gemini", () => {
    const p = resolveProvider({
      VANTA_PROVIDER: "gemini",
      GEMINI_API_KEY: "k",
      VANTA_MODEL: "gemini-2.5-pro",
    });
    expect(p.modelId()).toBe("gemini-2.5-pro");
  });

  it("throws an actionable error when the gemini key is missing", () => {
    expect(() => resolveProvider({ VANTA_PROVIDER: "gemini" })).toThrow(
      /GEMINI_API_KEY is not set.*vanta setup/s,
    );
  });

  it("resolves openrouter via OPENROUTER_API_KEY", () => {
    const p = resolveProvider({
      VANTA_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "k",
    });
    expect(p.modelId()).toBe("anthropic/claude-sonnet-4.5");
  });

  it("throws an actionable error when the openrouter key is missing", () => {
    expect(() => resolveProvider({ VANTA_PROVIDER: "openrouter" })).toThrow(
      /OPENROUTER_API_KEY is not set.*vanta setup/s,
    );
  });

  it("rejects an unknown provider naming the valid options", () => {
    expect(() => resolveProvider({ VANTA_PROVIDER: "bogus" })).toThrow(
      /Unknown VANTA_PROVIDER.*gemini.*openrouter/s,
    );
  });
});
