import type { ProviderEffortLevel } from "../providers/model-settings.js";
import { activeProviderSettings, applyProviderSettings, parseModelSettingsScope, unsupportedSettingsMessage } from "./provider-settings.js";
import type { SlashHandler } from "./types.js";

function usage(current: ProviderEffortLevel, options: ProviderEffortLevel[]): string {
  return `  effort ${current}\n  usage: /effort <${options.join("|")}> [--session|--global]`;
}

export const effort: SlashHandler = async (arg, ctx) => {
  const parsed = parseModelSettingsScope(arg);
  const active = activeProviderSettings(ctx);
  const capability = active.capabilities.effort;
  if (!capability) return { output: unsupportedSettingsMessage(active.providerId, active.modelId) };
  const current = active.current.effortLevel ?? capability.defaultValue;
  if (parsed.error) return { output: `  ${parsed.error}\n${usage(current, capability.options)}` };
  if (!parsed.value) return { output: usage(current, capability.options) };
  const value = parsed.value.toLowerCase();
  try {
    const settings = await applyProviderSettings(ctx, { effortLevel: value as ProviderEffortLevel }, parsed.scope);
    return { output: `  effort ${settings.effortLevel} · ${parsed.scope === "global" ? "project default" : "this session"}` };
  } catch (error) {
    return { output: `  ${error instanceof Error ? error.message : String(error)}\n${usage(current, capability.options)}` };
  }
};
