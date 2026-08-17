import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  normalizeProviderModelSettings,
  providerModelSettingsCapabilities,
} from "./model-settings.js";

const homes: string[] = [];

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("provider model settings capabilities", () => {
  it("exposes Codex reasoning and speed without inventing unsupported controls", () => {
    expect(providerModelSettingsCapabilities("codex", "gpt-5.6-sol", { CODEX_HOME: "/missing-codex-settings-fixture" })).toEqual({
      effort: {
        defaultValue: "medium",
        options: ["low", "medium", "high", "xhigh", "max", "ultra"],
      },
      speed: {
        defaultValue: "standard",
        options: ["standard", "fast"],
      },
    });
  });

  it("uses connected Codex metadata for each model instead of advertising one broad menu", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-codex-settings-"));
    homes.push(home);
    await writeFile(join(home, "models_cache.json"), JSON.stringify({ models: [
      {
        slug: "gpt-5.6-sol",
        default_reasoning_level: "low",
        supported_reasoning_levels: ["low", "medium", "high", "xhigh", "max", "ultra"].map((effort) => ({ effort })),
        additional_speed_tiers: ["fast"],
        service_tiers: [{ id: "priority" }],
      },
      {
        slug: "gpt-5.3-codex-spark",
        default_reasoning_level: "high",
        supported_reasoning_levels: ["low", "medium", "high", "xhigh"].map((effort) => ({ effort })),
        additional_speed_tiers: [],
        service_tiers: [],
      },
    ] }));

    expect(providerModelSettingsCapabilities("codex", "gpt-5.6-sol", { CODEX_HOME: home })).toEqual({
      effort: { defaultValue: "low", options: ["low", "medium", "high", "xhigh", "max", "ultra"] },
      speed: { defaultValue: "standard", options: ["standard", "fast"] },
    });
    expect(providerModelSettingsCapabilities("codex", "gpt-5.3-codex-spark", { CODEX_HOME: home })).toEqual({
      effort: { defaultValue: "high", options: ["low", "medium", "high", "xhigh"] },
    });
  });

  it("exposes Claude Code effort but does not claim a speed tier", () => {
    expect(providerModelSettingsCapabilities("claude-code", "claude-sonnet-5")).toEqual({
      effort: {
        defaultValue: "medium",
        options: ["low", "medium", "high", "xhigh", "max"],
      },
    });
  });

  it("exposes reasoning effort for every direct-API Claude model", () => {
    for (const model of ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-3-5-sonnet"]) {
      expect(providerModelSettingsCapabilities("anthropic", model)).toEqual({
        effort: { defaultValue: "medium", options: ["low", "medium", "high", "xhigh", "max"] },
      });
    }
  });

  it("adds the fast speed tier only for the Opus models that support fast mode", () => {
    for (const provider of ["anthropic", "claude-code"]) {
      for (const model of ["claude-opus-5", "claude-opus-4-8"]) {
        expect(providerModelSettingsCapabilities(provider, model)).toEqual({
          effort: { defaultValue: "medium", options: ["low", "medium", "high", "xhigh", "max"] },
          speed: { defaultValue: "standard", options: ["standard", "fast"] },
        });
      }
      // Opus 4.7 errors on speed:"fast"; Sonnet has no fast tier at all.
      for (const model of ["claude-opus-4-7", "claude-sonnet-5"]) {
        expect(providerModelSettingsCapabilities(provider, model).speed).toBeUndefined();
      }
    }
  });

  it("rejects unsupported values instead of silently dropping them", () => {
    expect(() => normalizeProviderModelSettings("claude-code", "claude-sonnet-5", {
      effortLevel: "ultra",
      speed: "fast",
    })).toThrow(/does not support/i);
  });
});
