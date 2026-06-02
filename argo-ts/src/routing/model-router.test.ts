import { describe, it, expect } from "vitest";
import { resolveProvider } from "../providers/index.js";
import { classifyTask, resolveRoutedProvider } from "./model-router.js";

describe("classifyTask", () => {
  it("routes planning to expensive", () => {
    expect(classifyTask("plan the architecture")).toBe("expensive");
  });

  it("routes code implementation to expensive", () => {
    expect(classifyTask("implement the parser")).toBe("expensive");
  });

  it("routes listing to cheap", () => {
    expect(classifyTask("list my goals")).toBe("cheap");
  });

  it("routes status checks to cheap", () => {
    expect(classifyTask("what's the status")).toBe("cheap");
  });

  it("leans expensive when ambiguous", () => {
    expect(classifyTask("tell me about the weather in Valencia")).toBe(
      "expensive",
    );
  });
});

describe("resolveRoutedProvider", () => {
  const baseEnv: NodeJS.ProcessEnv = { ARGO_PROVIDER: "ollama" };

  it("uses the expensive override for an expensive task", () => {
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      ARGO_MODEL_EXPENSIVE: "qwen2.5:72b",
    };
    const provider = resolveRoutedProvider(env, "implement the parser");
    expect(provider.modelId()).toBe("qwen2.5:72b");
  });

  it("uses the cheap override for a cheap task", () => {
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      ARGO_MODEL_CHEAP: "qwen2.5:7b",
    };
    const provider = resolveRoutedProvider(env, "list my goals");
    expect(provider.modelId()).toBe("qwen2.5:7b");
  });

  it("falls back to the default model when no override is set", () => {
    const provider = resolveRoutedProvider(baseEnv, "implement the parser");
    expect(provider.modelId()).toBe(resolveProvider(baseEnv).modelId());
  });

  it("ignores the cheap override for an expensive task", () => {
    const env: NodeJS.ProcessEnv = {
      ...baseEnv,
      ARGO_MODEL_CHEAP: "qwen2.5:7b",
    };
    // Expensive task with only a cheap override → no relevant override → default.
    const provider = resolveRoutedProvider(env, "refactor the loop");
    expect(provider.modelId()).toBe(resolveProvider(baseEnv).modelId());
  });
});
