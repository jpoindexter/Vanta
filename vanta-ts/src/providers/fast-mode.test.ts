import { describe, expect, it } from "vitest";
import {
  anthropicFastModeSupported,
  buildAnthropicSpeedParams,
  fastModeActive,
  fastModeBetaHeader,
  withFastModeBeta,
} from "./fast-mode.js";

describe("anthropicFastModeSupported", () => {
  it("accepts the documented Opus fast-mode models, including dated snapshots", () => {
    expect(anthropicFastModeSupported("claude-opus-5", {})).toBe(true);
    expect(anthropicFastModeSupported("claude-opus-4-8", {})).toBe(true);
    expect(anthropicFastModeSupported("claude-opus-5-20260210", {})).toBe(true);
    expect(anthropicFastModeSupported("CLAUDE-OPUS-5", {})).toBe(true);
  });

  it("rejects models Anthropic errors on or silently downgrades", () => {
    for (const model of ["claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-5", "claude-haiku-4-5", ""]) {
      expect(anthropicFastModeSupported(model, {})).toBe(false);
    }
  });

  it("honors VANTA_FAST_MODE_MODELS for a newly supported model", () => {
    expect(anthropicFastModeSupported("claude-opus-6", { VANTA_FAST_MODE_MODELS: " claude-opus-6 , " })).toBe(true);
    expect(anthropicFastModeSupported("claude-sonnet-5", { VANTA_FAST_MODE_MODELS: "claude-opus-6" })).toBe(false);
  });
});

describe("buildAnthropicSpeedParams", () => {
  it("sends speed:fast only when fast is requested on a supported model", () => {
    expect(buildAnthropicSpeedParams("claude-opus-5", { serviceTier: "fast" }, {})).toEqual({ speed: "fast" });
  });

  it("omits speed for standard, unset, and unsupported models", () => {
    expect(buildAnthropicSpeedParams("claude-opus-5", { serviceTier: "standard" }, {})).toEqual({});
    expect(buildAnthropicSpeedParams("claude-opus-5", undefined, {})).toEqual({});
    expect(buildAnthropicSpeedParams("claude-opus-4-7", { serviceTier: "fast" }, {})).toEqual({});
  });

  it("explains the downgrade instead of failing silently", () => {
    const logs: string[] = [];
    buildAnthropicSpeedParams("claude-sonnet-5", { serviceTier: "fast" }, {}, (m) => logs.push(m));
    expect(logs[0]).toContain("does not support fast mode");
  });
});

describe("fastModeActive", () => {
  it("is true only for a requested and supported fast request", () => {
    expect(fastModeActive("claude-opus-4-8", { serviceTier: "fast" }, {})).toBe(true);
    expect(fastModeActive("claude-opus-4-8", { serviceTier: "standard" }, {})).toBe(false);
    expect(fastModeActive("claude-sonnet-5", { serviceTier: "fast" }, {})).toBe(false);
  });
});

describe("withFastModeBeta", () => {
  it("adds the fast-mode beta without dropping existing betas", () => {
    expect(withFastModeBeta(["oauth-2025-04-20"], true, {}))
      .toEqual(["oauth-2025-04-20", "fast-mode-2026-02-01"]);
  });

  it("leaves the list unchanged when fast mode is off", () => {
    expect(withFastModeBeta(["oauth-2025-04-20"], false, {})).toEqual(["oauth-2025-04-20"]);
  });

  it("dedups and honors a beta-id override", () => {
    expect(withFastModeBeta(["a", "a"], false, {})).toEqual(["a"]);
    expect(withFastModeBeta([], true, { VANTA_FAST_MODE_BETA: "fast-mode-2026-09-01" }))
      .toEqual(["fast-mode-2026-09-01"]);
    expect(fastModeBetaHeader({ VANTA_FAST_MODE_BETA: "  " })).toBe("fast-mode-2026-02-01");
  });
});
