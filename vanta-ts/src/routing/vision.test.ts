import { describe, it, expect } from "vitest";
import { visionEnv } from "./vision.js";

describe("visionEnv", () => {
  it("returns the env unchanged when VANTA_VISION_MODEL is unset", () => {
    const env = { VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt-5" };
    expect(visionEnv(env)).toEqual(env);
  });

  it("swaps VANTA_MODEL to the vision model, keeping the active provider", () => {
    const env = {
      VANTA_PROVIDER: "openrouter",
      VANTA_MODEL: "deepseek/deepseek-v4",
      VANTA_VISION_MODEL: "gpt-4o-mini",
    };
    const out = visionEnv(env);
    expect(out.VANTA_MODEL).toBe("gpt-4o-mini");
    expect(out.VANTA_PROVIDER).toBe("openrouter");
  });

  it("swaps both model and provider when VANTA_VISION_PROVIDER is set", () => {
    const env = {
      VANTA_PROVIDER: "ollama",
      VANTA_MODEL: "qwen2.5:14b",
      VANTA_VISION_MODEL: "gpt-4o-mini",
      VANTA_VISION_PROVIDER: "openai",
    };
    const out = visionEnv(env);
    expect(out.VANTA_MODEL).toBe("gpt-4o-mini");
    expect(out.VANTA_PROVIDER).toBe("openai");
  });

  it("does not mutate the input env", () => {
    const env = {
      VANTA_PROVIDER: "openai",
      VANTA_MODEL: "gpt-5",
      VANTA_VISION_MODEL: "gpt-4o-mini",
    };
    const copy = { ...env };
    visionEnv(env);
    expect(env).toEqual(copy);
  });
});
