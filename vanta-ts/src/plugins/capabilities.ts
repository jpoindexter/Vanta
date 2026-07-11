export const PLUGIN_CAPABILITIES = [
  "log.write",
  "storage.read",
  "storage.write",
  "schedule.jobs",
  "ui.panel",
  "llm.generate",
] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export function isPluginCapability(value: string): value is PluginCapability {
  return (PLUGIN_CAPABILITIES as readonly string[]).includes(value);
}
