import { z } from "zod";
import { MonitorSchema } from "./monitors.js";

const PluginName = /^[a-z][a-z0-9_-]{0,63}$/;

export const PluginManifestSchema = z.object({
  name: z.string().regex(PluginName),
  version: z.string().min(1),
  description: z.string().optional(),
  main: z.string().min(1).default("index.js"),
  tools: z.array(z.string()).optional(),
  commands: z.array(z.string()).optional(),
  requiresEnv: z.array(z.string()).optional(),
  monitors: z.array(MonitorSchema).optional(),
}).strict();

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export function parsePluginManifest(raw: unknown): PluginManifest {
  return PluginManifestSchema.parse(raw);
}

export function pluginToolPrefix(pluginName: string): string {
  return `plugin_${pluginName.replace(/[^a-zA-Z0-9_]/g, "_")}_`;
}

