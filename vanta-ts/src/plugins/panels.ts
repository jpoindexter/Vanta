import { z } from "zod";
import type { DashboardPanelManifest } from "./manifest.js";
import type { PluginCapability } from "./capabilities.js";

const PanelId = /^[a-z][a-z0-9_-]{0,63}$/;

export const WorkerPanelSchema = z.object({
  id: z.string().regex(PanelId),
  title: z.string().min(1).max(80),
  lines: z.array(z.string().max(240)).max(40),
}).strict();

export type WorkerPanel = z.infer<typeof WorkerPanelSchema>;
export type PluginPanel = WorkerPanel & {
  plugin: string; key: string; provider?: string; refreshMs?: number;
  actions?: DashboardPanelManifest["actions"];
};

const ANSI_SEQUENCE = new RegExp("[\\u001b\\u009b][[\\]();?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-Za-z]|\\u001b[@-Z\\\\-_]", "g");
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

function safeDisplay(value: string): string {
  return value.replace(ANSI_SEQUENCE, "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

export class PluginPanelRegistry {
  readonly #panels = new Map<string, PluginPanel>();

  register(plugin: string, input: unknown): PluginPanel {
    const panel = WorkerPanelSchema.parse(input);
    const key = `${plugin}:${panel.id}`;
    const contribution = {
      ...panel,
      title: safeDisplay(panel.title),
      plugin,
      key,
      ...this.#panels.get(key),
      lines: panel.lines.map(safeDisplay),
    };
    this.#panels.set(key, contribution);
    return contribution;
  }

  publish(plugin: string, declaration: DashboardPanelManifest, lines: unknown, granted: readonly PluginCapability[]): PluginPanel {
    const missing = declaration.requiredCapabilities.filter((capability) => !granted.includes(capability));
    if (missing.length) throw new Error(`dashboard panel ${declaration.id} needs granted capabilities: ${missing.join(", ")}`);
    const content = z.array(z.string().max(240)).max(40).parse(lines);
    const panel = this.register(plugin, { id: declaration.id, title: declaration.title, lines: content });
    const declared = {
      ...panel,
      provider: declaration.provider,
      refreshMs: declaration.refreshMs,
      actions: declaration.actions.map((action) => ({ ...action, label: safeDisplay(action.label), prompt: safeDisplay(action.prompt) })),
    };
    this.#panels.set(panel.key, declared);
    return declared;
  }

  get(key: string): PluginPanel | undefined {
    return this.#panels.get(key);
  }

  list(): PluginPanel[] {
    return [...this.#panels.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  removePlugin(plugin: string): void {
    for (const [key, panel] of this.#panels) if (panel.plugin === plugin) this.#panels.delete(key);
  }
}
