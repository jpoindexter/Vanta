import { describe, it, expect } from "vitest";
import { modelSupports, PROVIDER_CATALOG } from "./catalog.js";

describe("modelSupports", () => {
  it("returns true for temperature on a standard model", () => {
    expect(modelSupports("gpt-4o", "temperature")).toBe(true);
  });

  it("returns false for temperature on an o-series reasoning model", () => {
    expect(modelSupports("o3", "temperature")).toBe(false);
    expect(modelSupports("o4-mini", "temperature")).toBe(false);
    expect(modelSupports("o3-mini", "temperature")).toBe(false);
  });

  it("returns true for reasoning_effort on o-series models", () => {
    expect(modelSupports("o3", "reasoning_effort")).toBe(true);
    expect(modelSupports("o4-mini", "reasoning_effort")).toBe(true);
  });

  it("returns false for reasoning_effort on non-o-series models", () => {
    expect(modelSupports("gpt-4o", "reasoning_effort")).toBe(false);
    expect(modelSupports("claude-sonnet-4-6", "reasoning_effort")).toBe(false);
  });

  it("returns true for thinking on claude-3-7+ and claude-4+ models", () => {
    expect(modelSupports("claude-sonnet-4-6", "thinking")).toBe(true);
    expect(modelSupports("claude-opus-4-8", "thinking")).toBe(true);
    expect(modelSupports("claude-haiku-4-5", "thinking")).toBe(true);
  });

  it("returns false for thinking on older Claude models", () => {
    expect(modelSupports("claude-3-opus-20240229", "thinking")).toBe(false);
    expect(modelSupports("claude-3-sonnet-20240229", "thinking")).toBe(false);
  });

  it("returns true for unknown capabilities (default allow)", () => {
    expect(modelSupports("some-unknown-model", "temperature")).toBe(true);
    expect(modelSupports("gpt-4o", "some_future_param" as never)).toBe(true);
  });

  it("returns true for unknown model IDs (default allow)", () => {
    expect(modelSupports("my-custom-ollama-model", "temperature")).toBe(true);
  });
});

describe("PROVIDER_CATALOG", () => {
  it("every entry has required fields", () => {
    for (const p of PROVIDER_CATALOG) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.defaultModel).toBeTruthy();
      expect(Array.isArray(p.models)).toBe(true);
    }
  });

  it("surfaces the current GPT-5.6 family for OpenAI API and Codex subscription users", () => {
    for (const providerId of ["openai", "codex"]) {
      const provider = PROVIDER_CATALOG.find((entry) => entry.id === providerId);
      expect(provider?.defaultModel).toBe("gpt-5.6-sol");
      expect(provider?.models).toEqual(expect.arrayContaining([
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
      ]));
    }
  });
});
