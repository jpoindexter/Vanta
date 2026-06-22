import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROVIDER_TIMEOUT_SEC,
  WATCHDOG_COLD_START_MARGIN_SEC,
  activeProviderId,
  resolveProviderTimeoutSec,
  resolveProviderTimeoutMs,
  watchdogStallMinutes,
} from "./timeout.js";

const env = (over: Record<string, string>): NodeJS.ProcessEnv => over as NodeJS.ProcessEnv;

describe("resolveProviderTimeoutSec", () => {
  it("defaults to the SDK-matching 600s for a warm hosted provider", () => {
    expect(resolveProviderTimeoutSec(env({ VANTA_PROVIDER: "openai" }))).toBe(600);
    expect(resolveProviderTimeoutSec(env({}))).toBe(DEFAULT_PROVIDER_TIMEOUT_SEC);
  });

  it("gives cold-start-prone providers a longer window than the warm default", () => {
    expect(resolveProviderTimeoutSec(env({ VANTA_PROVIDER: "ollama" }))).toBe(1800);
    expect(resolveProviderTimeoutSec(env({ VANTA_PROVIDER: "deepseek" }))).toBe(900);
    expect(resolveProviderTimeoutSec(env({ VANTA_PROVIDER: "ollama" }))).toBeGreaterThan(
      DEFAULT_PROVIDER_TIMEOUT_SEC,
    );
  });

  it("an explicit VANTA_PROVIDER_TIMEOUT_SEC overrides the per-provider default", () => {
    expect(
      resolveProviderTimeoutSec(env({ VANTA_PROVIDER: "ollama", VANTA_PROVIDER_TIMEOUT_SEC: "300" })),
    ).toBe(300);
  });

  it("ignores a non-positive / non-numeric override and falls back", () => {
    expect(resolveProviderTimeoutSec(env({ VANTA_PROVIDER_TIMEOUT_SEC: "0" }))).toBe(600);
    expect(resolveProviderTimeoutSec(env({ VANTA_PROVIDER_TIMEOUT_SEC: "abc" }))).toBe(600);
    expect(resolveProviderTimeoutSec(env({ VANTA_PROVIDER_TIMEOUT_SEC: "-5" }))).toBe(600);
  });

  it("resolveProviderTimeoutMs is the seconds value × 1000", () => {
    expect(resolveProviderTimeoutMs(env({ VANTA_PROVIDER: "openai" }))).toBe(600_000);
  });

  it("activeProviderId lowercases and defaults to openai", () => {
    expect(activeProviderId(env({ VANTA_PROVIDER: "DeepSeek" }))).toBe("deepseek");
    expect(activeProviderId(env({}))).toBe("openai");
  });
});

describe("watchdogStallMinutes", () => {
  it("honors a generous operator floor when it exceeds the provider window", () => {
    // openai window = ceil((600+120)/60) = 12; floor 30 wins.
    expect(watchdogStallMinutes(env({ VANTA_PROVIDER: "openai" }), 30)).toBe(30);
  });

  it("clamps a too-tight floor UP to the provider window (the bug fix)", () => {
    // A 5-minute floor would false-fire before a 600s provider call; clamp to 12.
    expect(watchdogStallMinutes(env({ VANTA_PROVIDER: "openai" }), 5)).toBe(12);
  });

  it("grows with the configured timeout so a slow-first-call provider isn't pre-empted", () => {
    // A slow provider stub with a 2400s configured timeout → window = ceil((2400+120)/60) = 42.
    const slow = env({ VANTA_PROVIDER: "custom", VANTA_PROVIDER_TIMEOUT_SEC: "2400" });
    expect(watchdogStallMinutes(slow, 30)).toBe(42);
    expect(watchdogStallMinutes(slow, 30)).toBeGreaterThan(2400 / 60);
  });

  it("never drops below the provider window regardless of floor", () => {
    const cold = env({ VANTA_PROVIDER: "ollama" }); // 1800s → window 32m
    expect(watchdogStallMinutes(cold, 1)).toBe(32);
    expect(watchdogStallMinutes(cold, 1)).toBeGreaterThanOrEqual(
      Math.ceil((1800 + WATCHDOG_COLD_START_MARGIN_SEC) / 60),
    );
  });
});
