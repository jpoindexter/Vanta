import { describe, it, expect } from "vitest";
import { resolveContextWindow } from "./openai.js";

describe("resolveContextWindow", () => {
  it("maps the GPT-5.6 family to its documented 1.05M context window", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(resolveContextWindow("gpt-5.6-sol", env)).toBe(1_050_000);
    expect(resolveContextWindow("gpt-5.6-terra", env)).toBe(1_050_000);
    expect(resolveContextWindow("gpt-5.6-luna", env)).toBe(1_050_000);
  });

  it("maps MiniMax-M3 to 1M (not the 32k default)", () => {
    expect(resolveContextWindow("MiniMax-M3", {} as NodeJS.ProcessEnv)).toBe(1_048_576);
    expect(resolveContextWindow("MiniMax-M2", {} as NodeJS.ProcessEnv)).toBe(204_800);
  });
  it("falls back to 32k for an unknown model", () => {
    expect(resolveContextWindow("some-future-model", {} as NodeJS.ProcessEnv)).toBe(32_000);
  });
  it("VANTA_CONTEXT_WINDOW overrides everything (fix any unmapped model)", () => {
    expect(resolveContextWindow("some-future-model", { VANTA_CONTEXT_WINDOW: "262144" } as unknown as NodeJS.ProcessEnv)).toBe(262_144);
    expect(resolveContextWindow("MiniMax-M3", { VANTA_CONTEXT_WINDOW: "500000" } as unknown as NodeJS.ProcessEnv)).toBe(500_000);
  });
  it("ignores a non-numeric / zero override", () => {
    expect(resolveContextWindow("gpt-4o", { VANTA_CONTEXT_WINDOW: "nope" } as unknown as NodeJS.ProcessEnv)).toBe(128_000);
    expect(resolveContextWindow("gpt-4o", { VANTA_CONTEXT_WINDOW: "0" } as unknown as NodeJS.ProcessEnv)).toBe(128_000);
  });
});

describe("resolveContextWindow — router-prefixed model ids", () => {
  it("strips a provider prefix (colon or slash) and matches case-insensitively", () => {
    const e = {} as NodeJS.ProcessEnv;
    expect(resolveContextWindow("minimax:MiniMax-M3", e)).toBe(1_048_576); // TokenRouter
    expect(resolveContextWindow("minimax/minimax-m3", e)).toBe(1_048_576); // OpenRouter style
    expect(resolveContextWindow("openai:gpt-4o", e)).toBe(128_000);
  });
});
