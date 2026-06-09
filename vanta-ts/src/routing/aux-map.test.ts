import { describe, it, expect } from "vitest";
import { resolveAuxProvider, describeAuxMap } from "./aux-map.js";

const BASE_ENV: NodeJS.ProcessEnv = {
  VANTA_PROVIDER: "openai",
  VANTA_MODEL: "gpt-4o-mini",
  OPENAI_API_KEY: "test-key",
};

describe("resolveAuxProvider", () => {
  it("returns the base provider when no override is set", () => {
    const p = resolveAuxProvider("vision", BASE_ENV);
    expect(p.modelId()).toBe("gpt-4o-mini");
  });

  it("swaps VANTA_MODEL when VANTA_MODEL_VISION is set", () => {
    const env = { ...BASE_ENV, VANTA_MODEL_VISION: "gpt-4o" };
    const p = resolveAuxProvider("vision", env);
    expect(p.modelId()).toBe("gpt-4o");
  });

  it("swaps provider when VANTA_VISION_PROVIDER is set", () => {
    const env = {
      ...BASE_ENV,
      VANTA_VISION_PROVIDER: "ollama",
      VANTA_MODEL_VISION: "llava",
      VANTA_OLLAMA_URL: "http://localhost:11434",
    };
    const p = resolveAuxProvider("vision", env);
    expect(p.modelId()).toBe("llava");
  });

  it("routes summarize independently of vision", () => {
    const env = {
      ...BASE_ENV,
      VANTA_MODEL_VISION: "gpt-4o",
      VANTA_MODEL_SUMMARIZE: "gpt-4o-mini",
    };
    const vision = resolveAuxProvider("vision", env);
    const summarize = resolveAuxProvider("summarize", env);
    expect(vision.modelId()).toBe("gpt-4o");
    expect(summarize.modelId()).toBe("gpt-4o-mini");
  });

  it("does not mutate the input env", () => {
    const env = { ...BASE_ENV, VANTA_MODEL_TITLE: "gpt-4o-mini" };
    const frozen = { ...env };
    resolveAuxProvider("title", env);
    expect(env).toEqual(frozen);
  });
});

describe("describeAuxMap", () => {
  it("returns a no-overrides message when env is bare", () => {
    const desc = describeAuxMap(BASE_ENV);
    expect(desc).toContain("no per-function");
  });

  it("lists configured overrides", () => {
    const env = { ...BASE_ENV, VANTA_MODEL_VISION: "gpt-4o", VANTA_MODEL_CODE: "deepseek-coder" };
    const desc = describeAuxMap(env);
    expect(desc).toContain("vision");
    expect(desc).toContain("gpt-4o");
    expect(desc).toContain("code");
    expect(desc).toContain("deepseek-coder");
  });

  it("does not list unconfigured functions", () => {
    const env = { ...BASE_ENV, VANTA_MODEL_VISION: "gpt-4o" };
    const desc = describeAuxMap(env);
    expect(desc).not.toContain("embed");
    expect(desc).not.toContain("classify");
  });
});
