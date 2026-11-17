import { activeProviderSettings, applyProviderSettings, parseModelSettingsScope, unsupportedSettingsMessage } from "./provider-settings.js";
import type { SlashHandler } from "./types.js";

export const modelSettings: SlashHandler = async (arg, ctx) => {
  const parsed = parseModelSettingsScope(arg);
  const active = activeProviderSettings(ctx);
  if (parsed.error) return { output: `  ${parsed.error}` };
  if (!active.capabilities.effort && !active.capabilities.speed) {
    return { output: unsupportedSettingsMessage(active.providerId, active.modelId) };
  }
  if (parsed.value) return { output: "  usage: /model-settings [--global]" };
  const detail = [
    active.current.effortLevel ? `effort ${active.current.effortLevel}` : "",
    active.current.speed ? `speed ${active.current.speed}` : "",
  ].filter(Boolean).join(" · ");
  if (parsed.scope === "session") {
    return { output: `  ${active.providerId}/${active.modelId} · ${detail}\n  /effort and /speed change this session · /model-settings --global saves project defaults` };
  }
  try {
    await applyProviderSettings(ctx, active.current, "global");
    return { output: `  ${active.providerId}/${active.modelId} · ${detail} · saved as project defaults` };
  } catch (error) {
    return { output: `  project defaults not saved: ${error instanceof Error ? error.message : String(error)} · session settings unchanged` };
  }
};
