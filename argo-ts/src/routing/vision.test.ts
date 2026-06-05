import { describe, it, expect } from "vitest";
import { visionEnv } from "./vision.js";

describe("visionEnv", () => {
  it("returns the env unchanged when ARGO_VISION_MODEL is unset", () => {
    const env = { ARGO_PROVIDER: "openai", ARGO_MODEL: "gpt-5" };
    expect(visionEnv(env)).toEqual(env);
  });

  it("swaps ARGO_MODEL to the vision model, keeping the active provider", () => {
    const env = {
      ARGO_PROVIDER: "openrouter",
      ARGO_MODEL: "deepseek/deepseek-v4",
      ARGO_VISION_MODEL: "gpt-4o-mini",
    };
    const out = visionEnv(env);
    expect(out.ARGO_MODEL).toBe("gpt-4o-mini");
    expect(out.ARGO_PROVIDER).toBe("openrouter");
  });

  it("swaps both model and provider when ARGO_VISION_PROVIDER is set", () => {
    const env = {
      ARGO_PROVIDER: "ollama",
      ARGO_MODEL: "qwen2.5:14b",
      ARGO_VISION_MODEL: "gpt-4o-mini",
      ARGO_VISION_PROVIDER: "openai",
    };
    const out = visionEnv(env);
    expect(out.ARGO_MODEL).toBe("gpt-4o-mini");
    expect(out.ARGO_PROVIDER).toBe("openai");
  });

  it("does not mutate the input env", () => {
    const env = {
      ARGO_PROVIDER: "openai",
      ARGO_MODEL: "gpt-5",
      ARGO_VISION_MODEL: "gpt-4o-mini",
    };
    const copy = { ...env };
    visionEnv(env);
    expect(env).toEqual(copy);
  });
});
