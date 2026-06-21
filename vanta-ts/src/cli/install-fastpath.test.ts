import { describe, it, expect } from "vitest";
import {
  detectProvisionState,
  isFullyProvisioned,
  shouldSkipWizard,
  fastpathReason,
  type ProvisionState,
} from "./install-fastpath.js";

// Build a bare env so tests don't inherit the runner's real VANTA_PROVIDER / keys.
const env = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  overrides as NodeJS.ProcessEnv;

const state = (overrides: Partial<ProvisionState> = {}): ProvisionState => ({
  hasProvider: true,
  hasKey: true,
  storeReady: true,
  ...overrides,
});

describe("detectProvisionState", () => {
  it("openai + OPENAI_API_KEY + store → fully provisioned", () => {
    const s = detectProvisionState(
      env({ VANTA_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }),
      { storeExists: true },
    );
    expect(s).toEqual({ hasProvider: true, hasKey: true, storeReady: true });
  });

  it("ollama (local, no key) + store → fully provisioned without any key", () => {
    const s = detectProvisionState(env({ VANTA_PROVIDER: "ollama" }), { storeExists: true });
    expect(s).toEqual({ hasProvider: true, hasKey: true, storeReady: true });
  });

  it("a provider with NO matching key → hasKey false", () => {
    const s = detectProvisionState(env({ VANTA_PROVIDER: "openai" }), { storeExists: true });
    expect(s.hasProvider).toBe(true);
    expect(s.hasKey).toBe(false);
  });

  it("no store → storeReady false (not provisioned)", () => {
    const s = detectProvisionState(
      env({ VANTA_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }),
      { storeExists: false },
    );
    expect(s.storeReady).toBe(false);
  });

  it("unset VANTA_PROVIDER → hasProvider false, hasKey false", () => {
    const s = detectProvisionState(env({ OPENAI_API_KEY: "sk-test" }), { storeExists: true });
    expect(s.hasProvider).toBe(false);
    expect(s.hasKey).toBe(false);
  });

  it("unknown VANTA_PROVIDER → hasProvider false", () => {
    const s = detectProvisionState(env({ VANTA_PROVIDER: "made-up" }), { storeExists: true });
    expect(s.hasProvider).toBe(false);
    expect(s.hasKey).toBe(false);
  });

  it("VANTA_PROVIDER is matched case-insensitively", () => {
    const s = detectProvisionState(
      env({ VANTA_PROVIDER: "OpenAI", OPENAI_API_KEY: "sk-test" }),
      { storeExists: true },
    );
    expect(s.hasProvider).toBe(true);
    expect(s.hasKey).toBe(true);
  });

  it("claude-code (subscription, keyless) + store → fully provisioned", () => {
    const s = detectProvisionState(env({ VANTA_PROVIDER: "claude-code" }), { storeExists: true });
    expect(isFullyProvisioned(s)).toBe(true);
  });
});

describe("isFullyProvisioned", () => {
  it("true only when all three signals hold", () => {
    expect(isFullyProvisioned(state())).toBe(true);
  });

  it("false when any single signal is missing", () => {
    expect(isFullyProvisioned(state({ hasProvider: false }))).toBe(false);
    expect(isFullyProvisioned(state({ hasKey: false }))).toBe(false);
    expect(isFullyProvisioned(state({ storeReady: false }))).toBe(false);
  });
});

describe("shouldSkipWizard", () => {
  it("provisioned → true (skip the wizard)", () => {
    const ok = shouldSkipWizard(
      env({ VANTA_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }),
      { storeExists: true },
    );
    expect(ok).toBe(true);
  });

  it("VANTA_FORCE_SETUP=1 → false even when fully provisioned", () => {
    const ok = shouldSkipWizard(
      env({ VANTA_PROVIDER: "openai", OPENAI_API_KEY: "sk-test", VANTA_FORCE_SETUP: "1" }),
      { storeExists: true },
    );
    expect(ok).toBe(false);
  });

  it("partial config (provider but no key) → false (run the wizard)", () => {
    const ok = shouldSkipWizard(env({ VANTA_PROVIDER: "openai" }), { storeExists: true });
    expect(ok).toBe(false);
  });

  it("no store → false (run the wizard)", () => {
    const ok = shouldSkipWizard(
      env({ VANTA_PROVIDER: "ollama" }),
      { storeExists: false },
    );
    expect(ok).toBe(false);
  });

  it("empty env → false (run the wizard — safe default)", () => {
    expect(shouldSkipWizard(env(), { storeExists: false })).toBe(false);
  });
});

describe("fastpathReason", () => {
  it("names the skip when fully provisioned", () => {
    expect(fastpathReason(state())).toBe("skipping setup: provider+key+store ready");
  });

  it("names a missing provider", () => {
    expect(fastpathReason(state({ hasProvider: false, hasKey: false }))).toBe(
      "running setup: no provider",
    );
  });

  it("names a missing key when the provider is present", () => {
    expect(fastpathReason(state({ hasKey: false }))).toBe("running setup: no key");
  });

  it("names a missing store", () => {
    expect(fastpathReason(state({ storeReady: false }))).toBe("running setup: no store");
  });

  it("names multiple missing pieces", () => {
    expect(fastpathReason(state({ hasProvider: false, hasKey: false, storeReady: false }))).toBe(
      "running setup: no provider, no store",
    );
  });
});
