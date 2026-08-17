import { dirname } from "node:path";
import {
  defaultProviderModelSettings,
  normalizeProviderModelSettings,
  providerModelSettingsCapabilities,
  type ProviderModelSettings,
  type ProviderModelSettingsCapabilities,
} from "../providers/model-settings.js";
import { setEnv } from "../setup-env.js";
import type { ReplCtx } from "./types.js";

export type ModelSettingsScope = "session" | "global";

export type ActiveProviderSettings = {
  providerId: string;
  modelId: string;
  capabilities: ProviderModelSettingsCapabilities;
  current: ProviderModelSettings;
};

export function activeProviderSettings(ctx: ReplCtx): ActiveProviderSettings {
  const providerId = ctx.setup.provider.routeInfo?.()?.provider
    ?? ctx.state.providerId
    ?? ctx.env.VANTA_PROVIDER
    ?? "openai";
  const modelId = ctx.setup.provider.modelId();
  const capabilities = providerModelSettingsCapabilities(providerId, modelId, ctx.env);
  const current = defaultProviderModelSettings(providerId, modelId, {
    effortLevel: ctx.state.effortLevel ?? ctx.setup.effortLevel,
    speed: ctx.state.serviceTier ?? ctx.setup.serviceTier,
  }, ctx.env);
  return { providerId, modelId, capabilities, current };
}

export function parseModelSettingsScope(arg: string): { value: string; scope: ModelSettingsScope; error?: string } {
  const tokens = arg.trim().split(/\s+/).filter(Boolean);
  const hasGlobal = tokens.includes("--global");
  const hasSession = tokens.includes("--session");
  if (hasGlobal && hasSession) return { value: "", scope: "session", error: "choose one scope: --session or --global" };
  return {
    value: tokens.filter((token) => token !== "--global" && token !== "--session").join(" "),
    scope: hasGlobal ? "global" : "session",
  };
}

export async function applyProviderSettings(
  ctx: ReplCtx,
  input: ProviderModelSettings,
  scope: ModelSettingsScope,
): Promise<ProviderModelSettings> {
  const active = activeProviderSettings(ctx);
  const settings = normalizeProviderModelSettings(active.providerId, active.modelId, input, ctx.env);
  if (scope === "global") {
    const updates: Record<string, string> = {};
    if (settings.effortLevel) updates.VANTA_EFFORT_LEVEL = settings.effortLevel;
    if (settings.speed) updates.VANTA_SERVICE_TIER = settings.speed;
    await setEnv(dirname(ctx.dataDir), updates);
    Object.assign(ctx.env, updates);
  }
  if (settings.effortLevel) {
    ctx.state.effortLevel = settings.effortLevel;
    ctx.setup.effortLevel = settings.effortLevel;
  }
  if (settings.speed) {
    ctx.state.serviceTier = settings.speed;
    ctx.setup.serviceTier = settings.speed;
  }
  return settings;
}

export function unsupportedSettingsMessage(providerId: string, modelId: string): string {
  return `  ${providerId}/${modelId} does not expose effort or speed settings. Use /model to choose a model with declared capabilities.`;
}
