import { describe, it, expect } from "vitest";
import { resolveProvider } from "./index.js";

describe("resolveProvider", () => {
  it("resolves gemini via GEMINI_API_KEY with the default flash model", () => {
    const p = resolveProvider({ VANTA_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(p.modelId()).toBe("gemini-2.5-flash");
    expect(p.contextWindow()).toBe(1_000_000);
    expect(p.routeInfo?.()).toMatchObject({ provider: "gemini", baseRoute: "https://generativelanguage.googleapis.com/v1beta/openai", billingMode: "metered" });
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

  it("resolves OpenAI-compatible backends via baseURL swap", () => {
    expect(resolveProvider({ VANTA_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "k" }).modelId()).toBe("deepseek-chat");
    expect(resolveProvider({ VANTA_PROVIDER: "groq", GROQ_API_KEY: "k" }).modelId()).toBe("llama-3.3-70b-versatile");
    expect(resolveProvider({ VANTA_PROVIDER: "stepfun", STEPFUN_API_KEY: "k" }).modelId()).toBe("step-2-16k");
  });

  it("resolves LM Studio locally with no key", () => {
    const p = resolveProvider({ VANTA_PROVIDER: "lmstudio" });
    expect(p.modelId()).toBe("local-model");
    expect(p.routeInfo?.()).toMatchObject({ provider: "lmstudio", billingMode: "local" });
  });

  it("resolves Azure with the deployment as the default model", () => {
    const p = resolveProvider({
      VANTA_PROVIDER: "azure",
      AZURE_OPENAI_ENDPOINT: "https://r.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "gpt4o",
      AZURE_OPENAI_API_KEY: "k",
    });
    expect(p.modelId()).toBe("gpt4o");
    expect(p.routeInfo?.().baseRoute).toBe("https://r.openai.azure.com/openai/deployments/gpt4o");
  });

  it("resolves a custom OpenAI-compatible endpoint via VANTA_OPENAI_BASE_URL", () => {
    const p = resolveProvider({ VANTA_PROVIDER: "custom", VANTA_OPENAI_BASE_URL: "https://api.example.com/v1", VANTA_MODEL: "x" });
    expect(p.modelId()).toBe("x");
  });

  it("throws actionably when a compat key or the custom base URL is missing", () => {
    expect(() => resolveProvider({ VANTA_PROVIDER: "deepseek" })).toThrow(/DEEPSEEK_API_KEY/);
    expect(() => resolveProvider({ VANTA_PROVIDER: "custom" })).toThrow(/VANTA_OPENAI_BASE_URL/);
  });
});
