import type { ProviderSpeed } from "../providers/model-settings.js";
import { activeProviderSettings, applyProviderSettings, parseModelSettingsScope, unsupportedSettingsMessage } from "./provider-settings.js";
import type { SlashHandler } from "./types.js";

function usage(current: ProviderSpeed, options: ProviderSpeed[]): string {
  return `  speed ${current}\n  usage: /speed <${options.join("|")}> [--session|--global]`;
}

export const speed: SlashHandler = async (arg, ctx) => {
  const parsed = parseModelSettingsScope(arg);
  const active = activeProviderSettings(ctx);
  const capability = active.capabilities.speed;
  if (parsed.error) return { output: `  ${parsed.error}` };
  if (!capability) {
    if (parsed.value) {
      try {
        await applyProviderSettings(ctx, { speed: parsed.value.toLowerCase() as ProviderSpeed }, parsed.scope);
      } catch (error) {
        return { output: `  ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    if (!active.capabilities.effort) return { output: unsupportedSettingsMessage(active.providerId, active.modelId) };
    return { output: `  ${active.providerId}/${active.modelId} does not support speed settings. Use /model-settings to review supported controls.` };
  }
  const current = active.current.speed ?? capability.defaultValue;
  if (!parsed.value) return { output: usage(current, capability.options) };
  const value = parsed.value.toLowerCase();
  try {
    const settings = await applyProviderSettings(ctx, { speed: value as ProviderSpeed }, parsed.scope);
    return { output: `  speed ${settings.speed} · ${parsed.scope === "global" ? "project default" : "this session"}` };
  } catch (error) {
    return { output: `  ${error instanceof Error ? error.message : String(error)}\n${usage(current, capability.options)}` };
  }
};
