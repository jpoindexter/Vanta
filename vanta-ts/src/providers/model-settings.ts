import { isEffortLevel } from "../effort.js";
import type { EffortLevel } from "../types.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PROVIDER_SPEEDS = ["standard", "fast"] as const;
export type ProviderSpeed = typeof PROVIDER_SPEEDS[number];
export type ProviderEffortLevel = EffortLevel | "ultra";

export type ProviderModelSettings = {
  effortLevel?: ProviderEffortLevel;
  speed?: ProviderSpeed;
};

export type ProviderModelSettingsCapabilities = {
  effort?: { defaultValue: ProviderEffortLevel; options: ProviderEffortLevel[] };
  speed?: { defaultValue: ProviderSpeed; options: ProviderSpeed[] };
};

const CODEX_EFFORT: ProviderEffortLevel[] = ["low", "medium", "high", "xhigh", "max", "ultra"];
const CLAUDE_EFFORT: ProviderEffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

function isProviderEffortLevel(value: string): value is ProviderEffortLevel {
  return isEffortLevel(value) || value === "ultra";
}

type JsonObject = Record<string, unknown>;

function connectedCodexCapabilities(modelId: string, env: NodeJS.ProcessEnv): ProviderModelSettingsCapabilities | undefined {
  try {
    const home = env.CODEX_HOME?.trim() || join(homedir(), ".codex");
    const payload = JSON.parse(readFileSync(join(home, "models_cache.json"), "utf8")) as JsonObject;
    const models = Array.isArray(payload.models) ? payload.models : [];
    const model = models.find((entry): entry is JsonObject => Boolean(entry) && typeof entry === "object" && (entry as JsonObject).slug === modelId);
    if (!model) return undefined;
    const levels = (Array.isArray(model.supported_reasoning_levels) ? model.supported_reasoning_levels : [])
      .map((entry) => entry && typeof entry === "object" ? (entry as JsonObject).effort : undefined)
      .filter((value): value is ProviderEffortLevel => typeof value === "string" && isProviderEffortLevel(value));
    if (levels.length === 0) return {};
    const defaultEffort = typeof model.default_reasoning_level === "string" && isProviderEffortLevel(model.default_reasoning_level)
      && levels.includes(model.default_reasoning_level) ? model.default_reasoning_level : levels.includes("medium") ? "medium" : levels[0]!;
    const serviceTiers = Array.isArray(model.service_tiers) ? model.service_tiers : [];
    const speedTiers = Array.isArray(model.additional_speed_tiers) ? model.additional_speed_tiers : [];
    const supportsFast = speedTiers.includes("fast") || serviceTiers.some((entry) => entry && typeof entry === "object" && (entry as JsonObject).id === "priority");
    return {
      effort: { defaultValue: defaultEffort, options: [...new Set(levels)] },
      ...(supportsFast ? { speed: { defaultValue: model.default_service_tier === "priority" || model.default_service_tier === "fast" ? "fast" : "standard", options: [...PROVIDER_SPEEDS] } } : {}),
    };
  } catch {
    return undefined;
  }
}

function fallbackCodexCapabilities(modelId: string): ProviderModelSettingsCapabilities {
  const model = modelId.trim().toLowerCase();
  const options = model.includes("5.6-sol") || model.includes("5.6-terra")
    ? CODEX_EFFORT
    : model.includes("5.6-luna")
      ? CLAUDE_EFFORT
      : model.includes("5.5") || model.includes("5.4") || model.includes("spark")
        ? (["low", "medium", "high", "xhigh"] satisfies ProviderEffortLevel[])
        : CODEX_EFFORT;
  const supportsFast = !model.includes("mini") && !model.includes("spark");
  return {
    effort: { defaultValue: "medium", options: [...options] },
    ...(supportsFast ? { speed: { defaultValue: "standard", options: [...PROVIDER_SPEEDS] } } : {}),
  };
}

export function providerModelSettingsCapabilities(
  providerId: string,
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
): ProviderModelSettingsCapabilities {
  const provider = providerId.trim().toLowerCase();
  if (provider === "codex" || provider === "openai-codex") {
    return connectedCodexCapabilities(modelId, env) ?? fallbackCodexCapabilities(modelId);
  }
  if (provider === "claude-code" || provider === "claude-cli") {
    return { effort: { defaultValue: "medium", options: [...CLAUDE_EFFORT] } };
  }
  return {};
}

export function normalizeProviderModelSettings(
  providerId: string,
  modelId: string,
  input: { effortLevel?: unknown; speed?: unknown },
  env: NodeJS.ProcessEnv = process.env,
): ProviderModelSettings {
  const capabilities = providerModelSettingsCapabilities(providerId, modelId, env);
  const normalized: ProviderModelSettings = {};
  if (input.effortLevel !== undefined) {
    if (typeof input.effortLevel !== "string" || !isProviderEffortLevel(input.effortLevel)
      || !capabilities.effort?.options.includes(input.effortLevel)) {
      throw new Error(`${providerId} ${modelId} does not support effort ${String(input.effortLevel)}`);
    }
    normalized.effortLevel = input.effortLevel;
  }
  if (input.speed !== undefined) {
    if (typeof input.speed !== "string" || !PROVIDER_SPEEDS.includes(input.speed as ProviderSpeed)
      || !capabilities.speed?.options.includes(input.speed as ProviderSpeed)) {
      throw new Error(`${providerId} ${modelId} does not support speed ${String(input.speed)}`);
    }
    normalized.speed = input.speed as ProviderSpeed;
  }
  return normalized;
}

export function defaultProviderModelSettings(
  providerId: string,
  modelId: string,
  input: { effortLevel?: unknown; speed?: unknown } = {},
  env: NodeJS.ProcessEnv = process.env,
): ProviderModelSettings {
  const capabilities = providerModelSettingsCapabilities(providerId, modelId, env);
  const requested: ProviderModelSettings = {};
  // Stored settings can outlive one provider capability. Resolve each field
  // independently so one stale value does not erase another valid preference.
  if (input.effortLevel !== undefined) {
    try {
      requested.effortLevel = normalizeProviderModelSettings(providerId, modelId, {
        effortLevel: input.effortLevel,
      }, env).effortLevel;
    } catch {
      // Interactive writes remain strict through normalize().
    }
  }
  if (input.speed !== undefined) {
    try {
      requested.speed = normalizeProviderModelSettings(providerId, modelId, {
        speed: input.speed,
      }, env).speed;
    } catch {
      // Interactive writes remain strict through normalize().
    }
  }
  return {
    ...(capabilities.effort ? { effortLevel: requested.effortLevel ?? capabilities.effort.defaultValue } : {}),
    ...(capabilities.speed ? { speed: requested.speed ?? capabilities.speed.defaultValue } : {}),
  };
}
