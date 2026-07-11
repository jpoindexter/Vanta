import { z } from "zod";
import { MonitorSchema } from "./monitors.js";
import { PLUGIN_CAPABILITIES } from "./capabilities.js";

const PluginName = /^[a-z][a-z0-9_-]{0,63}$/;

export const PluginWorkerSchema = z.object({
  main: z.string().min(1),
  capabilities: z.array(z.enum(PLUGIN_CAPABILITIES)).default([]),
}).strict();

export const DashboardActionSchema = z.object({
  id: z.string().regex(PluginName),
  label: z.string().min(1).max(60),
  prompt: z.string().min(1).max(500),
}).strict();

export const DashboardPanelManifestSchema = z.object({
  id: z.string().regex(PluginName),
  title: z.string().min(1).max(80),
  provider: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
  refreshMs: z.number().int().min(5_000).max(3_600_000),
  actions: z.array(DashboardActionSchema).max(6).default([]),
  requiredCapabilities: z.array(z.enum(PLUGIN_CAPABILITIES)).min(1),
}).strict();

export const PluginManifestSchema = z.object({
  name: z.string().regex(PluginName),
  version: z.string().min(1),
  description: z.string().optional(),
  main: z.string().min(1).default("index.js"),
  tools: z.array(z.string()).optional(),
  commands: z.array(z.string()).optional(),
  requiresEnv: z.array(z.string()).optional(),
  monitors: z.array(MonitorSchema).optional(),
  worker: PluginWorkerSchema.optional(),
  dashboardPanels: z.array(DashboardPanelManifestSchema).max(8).optional(),
}).strict().superRefine((manifest, ctx) => {
  if (!manifest.dashboardPanels?.length) return;
  if (!manifest.worker) {
    ctx.addIssue({ code: "custom", message: "dashboardPanels require an isolated worker" });
    return;
  }
  const declared = new Set(manifest.worker.capabilities);
  for (const panel of manifest.dashboardPanels) {
    for (const capability of panel.requiredCapabilities) {
      if (!declared.has(capability)) ctx.addIssue({ code: "custom", message: `panel ${panel.id} requires undeclared capability ${capability}` });
    }
    if (!panel.requiredCapabilities.includes("ui.panel")) ctx.addIssue({ code: "custom", message: `panel ${panel.id} must require ui.panel` });
  }
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type DashboardPanelManifest = z.infer<typeof DashboardPanelManifestSchema>;

export function parsePluginManifest(raw: unknown): PluginManifest {
  return PluginManifestSchema.parse(raw);
}

export function pluginToolPrefix(pluginName: string): string {
  return `plugin_${pluginName.replace(/[^a-zA-Z0-9_]/g, "_")}_`;
}
