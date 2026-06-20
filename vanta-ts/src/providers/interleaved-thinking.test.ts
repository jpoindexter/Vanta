import { describe, it, expect } from "vitest";
import {
  wantsInterleavedThinking,
  interleavedBetaHeader,
  buildAnthropicBetas,
} from "./interleaved-thinking.js";

const THINKING_MODEL = "claude-sonnet-4-6";
const NON_THINKING_MODEL = "claude-3-haiku";
const DEFAULT_BETA = "interleaved-thinking-2025-05-14";

describe("wantsInterleavedThinking", () => {
  it("is true when thinking is active on a thinking-capable model (default on)", () => {
    expect(wantsInterleavedThinking({ model: THINKING_MODEL, thinkingActive: true }, {})).toBe(true);
  });

  it("is false when thinking is not active", () => {
    expect(wantsInterleavedThinking({ model: THINKING_MODEL, thinkingActive: false }, {})).toBe(false);
  });

  it("is false on a model that does not support thinking", () => {
    expect(wantsInterleavedThinking({ model: NON_THINKING_MODEL, thinkingActive: true }, {})).toBe(false);
  });

  it("is false when VANTA_INTERLEAVED_THINKING is an explicit disable value", () => {
    for (const v of ["0", "false", "no", "off", "OFF", " False "]) {
      expect(
        wantsInterleavedThinking({ model: THINKING_MODEL, thinkingActive: true }, { VANTA_INTERLEAVED_THINKING: v }),
      ).toBe(false);
    }
  });

  it("stays on for non-disable env values", () => {
    expect(
      wantsInterleavedThinking({ model: THINKING_MODEL, thinkingActive: true }, { VANTA_INTERLEAVED_THINKING: "1" }),
    ).toBe(true);
  });
});

describe("interleavedBetaHeader", () => {
  it("defaults to the named beta id", () => {
    expect(interleavedBetaHeader({})).toBe(DEFAULT_BETA);
  });

  it("honors VANTA_INTERLEAVED_BETA override (trimmed)", () => {
    expect(interleavedBetaHeader({ VANTA_INTERLEAVED_BETA: "  interleaved-thinking-2026-01-01  " })).toBe(
      "interleaved-thinking-2026-01-01",
    );
  });

  it("falls back to default when the override is blank", () => {
    expect(interleavedBetaHeader({ VANTA_INTERLEAVED_BETA: "   " })).toBe(DEFAULT_BETA);
  });
});

describe("buildAnthropicBetas", () => {
  const wantOpts = { model: THINKING_MODEL, thinkingActive: true };

  it("appends the interleaved beta when wanted", () => {
    expect(buildAnthropicBetas(["oauth-2025-04-20"], wantOpts, {})).toEqual([
      "oauth-2025-04-20",
      DEFAULT_BETA,
    ]);
  });

  it("preserves existing betas (never drops them)", () => {
    const existing = ["oauth-2025-04-20", "extended-cache-ttl-2025-04-11"];
    const out = buildAnthropicBetas(existing, wantOpts, {});
    for (const b of existing) expect(out).toContain(b);
    expect(out).toContain(DEFAULT_BETA);
  });

  it("dedups when the interleaved beta is already present", () => {
    const out = buildAnthropicBetas([DEFAULT_BETA, "oauth-2025-04-20"], wantOpts, {});
    expect(out).toEqual([DEFAULT_BETA, "oauth-2025-04-20"]);
    expect(out.filter((b) => b === DEFAULT_BETA)).toHaveLength(1);
  });

  it("uses the env-overridden beta id", () => {
    const out = buildAnthropicBetas([], wantOpts, { VANTA_INTERLEAVED_BETA: "custom-beta" });
    expect(out).toEqual(["custom-beta"]);
  });

  it("returns current unchanged (deduped) when not wanted", () => {
    const notWant = { model: THINKING_MODEL, thinkingActive: false };
    expect(buildAnthropicBetas(["oauth-2025-04-20"], notWant, {})).toEqual(["oauth-2025-04-20"]);
  });

  it("dedups existing betas even when not wanted", () => {
    const notWant = { model: NON_THINKING_MODEL, thinkingActive: true };
    expect(buildAnthropicBetas(["a", "a", "b"], notWant, {})).toEqual(["a", "b"]);
  });

  it("respects the env-disable when building betas", () => {
    expect(
      buildAnthropicBetas(["oauth-2025-04-20"], wantOpts, { VANTA_INTERLEAVED_THINKING: "off" }),
    ).toEqual(["oauth-2025-04-20"]);
  });
});
