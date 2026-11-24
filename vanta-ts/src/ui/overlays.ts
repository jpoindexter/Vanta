import { PROVIDER_CATALOG, providerById } from "../providers/catalog.js";
import {
  defaultProviderModelSettings,
  providerModelSettingsCapabilities,
  type ProviderEffortLevel,
  type ProviderModelSettings,
  type ProviderSpeed,
} from "../providers/model-settings.js";
import type { SessionMeta } from "../sessions/store.js";
import type { Skill } from "../skills/types.js";

// Pure builders for the inline overlays. Every selectable row carries the slash
// COMMAND it runs — so picking a session/skill/model/theme reduces to the same
// runSlash path the typed command uses, and the two can never diverge. cockpit
// + help are read-only panels (no rows).

export type OverlayKind = "setup" | "model" | "modelSettings" | "sessions" | "skills" | "cockpit" | "help" | "loops" | "review" | "context" | "mcp" | "tasks" | "agentEditor" | "teams" | "memory" | "workflowSelect" | "outputStyle" | "export" | "sandbox" | "config" | "stats" | "hooks" | "pluginPanels";
/** `mark` is an optional status glyph (● current) shown in its own column, left
 * of the label and distinct from the ❯ selection cursor. */
export type OverlayNext =
  | { kind: "modelProvider"; providerId: string }
  | { kind: "modelProviders" }
  | { kind: "modelSettings" }
  | { kind: "modelEffort" }
  | { kind: "modelSpeed" };
export type OverlayRow = { label: string; hint?: string; command: string; mark?: string; next?: OverlayNext; afterCommand?: OverlayNext };

/** Bare slash commands that open an inline overlay instead of printing text. */
export const PICKER_KINDS: Readonly<Record<string, OverlayKind>> = {
  model: "model", effort: "modelSettings", speed: "modelSettings", "model-settings": "modelSettings", setup: "setup", sessions: "sessions", skills: "skills", cockpit: "cockpit", help: "help",
  loops: "loops", changes: "review", context: "context", mcp: "mcp", agents: "agentEditor", teams: "teams", memory: "memory", "workflow-select": "workflowSelect", "output-style": "outputStyle", export: "export", sandbox: "sandbox", config: "config", stats: "stats", hooks: "hooks", "plugin-panels": "pluginPanels",
};

export function setupRows(): OverlayRow[] {
  return [
    { label: "Model", hint: "Provider and model for this session", command: "/model" },
    { label: "Telegram", hint: "Connect or repair messaging", command: "/setup telegram" },
    { label: "Voice", hint: "Choose a spoken-reply provider", command: "/setup tts" },
    { label: "MCP", hint: "Inspect tool-server connections", command: "/mcp" },
  ];
}

export function sessionRows(sessions: SessionMeta[]): OverlayRow[] {
  return sessions.map((s) => ({ label: `${s.id}  ${s.turns} turn(s)`, hint: s.title, command: `/resume ${s.id}` }));
}

export function skillRows(skills: Skill[]): OverlayRow[] {
  return skills.map((s) => ({ label: s.meta.name, hint: s.meta.description, command: `/${s.meta.name}` }));
}

export function modelRows(currentProviderId: string, currentModel?: string, current: ProviderModelSettings = {}, env: NodeJS.ProcessEnv = process.env): OverlayRow[] {
  const rows: OverlayRow[] = PROVIDER_CATALOG.map((p) => ({
    mark: p.id === currentProviderId ? "●" : undefined,
    label: p.short,
    hint: p.defaultModel,
    command: `/model ${p.id}`,
    next: { kind: "modelProvider", providerId: p.id },
  }));
  if (currentModel) {
    const capabilities = providerModelSettingsCapabilities(currentProviderId, currentModel, env);
    if (capabilities.effort || capabilities.speed) {
      const settings = defaultProviderModelSettings(currentProviderId, currentModel, current, env);
      rows.unshift({
        label: "Model settings",
        hint: settingsHint(settings),
        command: "/model-settings",
        next: { kind: "modelSettings" },
      });
    }
  }
  if (currentModel) rows.push({
    label: "Set current as default",
    hint: `${currentProviderId} · ${currentModel}`,
    command: `/model --global ${currentProviderId} ${currentModel}`,
  });
  return rows;
}

export function modelSettingsRows(
  providerId: string,
  modelId: string,
  current: ProviderModelSettings,
  env: NodeJS.ProcessEnv = process.env,
): OverlayRow[] {
  const capabilities = providerModelSettingsCapabilities(providerId, modelId, env);
  const settings = defaultProviderModelSettings(providerId, modelId, current, env);
  const rows: OverlayRow[] = [
    { label: "Back to models", hint: "Choose a provider or model", command: "/model", next: { kind: "modelProviders" } },
  ];
  if (capabilities.effort) rows.push({ label: "Effort", hint: settings.effortLevel ?? capabilities.effort.defaultValue, command: "/effort", next: { kind: "modelEffort" } });
  if (capabilities.speed) rows.push({ label: "Speed", hint: settings.speed ?? capabilities.speed.defaultValue, command: "/speed", next: { kind: "modelSpeed" } });
  if (capabilities.effort || capabilities.speed) rows.push({ label: "Save project defaults", hint: settingsHint(settings), command: "/model-settings --global" });
  return rows;
}

export function effortRows(
  providerId: string,
  modelId: string,
  current?: ProviderEffortLevel,
  env: NodeJS.ProcessEnv = process.env,
): OverlayRow[] {
  const capability = providerModelSettingsCapabilities(providerId, modelId, env).effort;
  if (!capability) return [];
  const selected = current ?? capability.defaultValue;
  return [
    { label: "Back to settings", command: "/model-settings", next: { kind: "modelSettings" } },
    ...capability.options.map((option) => ({
      label: effortLabel(option),
      hint: option === "ultra" ? "Uses allowance fastest" : "Reasoning depth",
      command: `/effort ${option} --session`,
      mark: option === selected ? "●" : undefined,
      afterCommand: { kind: "modelSettings" } as const,
    })),
  ];
}

export function speedRows(
  providerId: string,
  modelId: string,
  current?: ProviderSpeed,
  env: NodeJS.ProcessEnv = process.env,
): OverlayRow[] {
  const capability = providerModelSettingsCapabilities(providerId, modelId, env).speed;
  if (!capability) return [];
  const selected = current ?? capability.defaultValue;
  // The speed multiplier differs by provider: Anthropic documents up to 2.5x
  // output tokens/sec for Opus fast mode, Codex 1.5x for its fast tier.
  const anthropic = /^(anthropic|claude-code|claude-cli)$/.test(providerId.trim().toLowerCase());
  const fastHint = anthropic ? "up to 2.5× output speed, premium rate" : "1.5× speed, increased usage";
  return [
    { label: "Back to settings", command: "/model-settings", next: { kind: "modelSettings" } },
    ...capability.options.map((option) => ({
      label: option === "fast" ? "Fast" : "Standard",
      hint: option === "fast" ? fastHint : "Default speed",
      command: `/speed ${option} --session`,
      mark: option === selected ? "●" : undefined,
      afterCommand: { kind: "modelSettings" } as const,
    })),
  ];
}

function settingsHint(settings: ProviderModelSettings): string {
  return [settings.effortLevel ? `effort ${settings.effortLevel}` : "", settings.speed ? `speed ${settings.speed}` : ""].filter(Boolean).join(" · ");
}

function effortLabel(value: ProviderEffortLevel): string {
  return value === "xhigh" ? "Extra high" : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

export function providerModelRows(
  providerId: string,
  models: string[],
  currentProviderId: string,
  currentModel?: string,
): OverlayRow[] {
  const provider = providerById(providerId);
  const unique = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  return [
    { label: "Back to providers", hint: "Choose another provider", command: "/model", next: { kind: "modelProviders" } },
    ...unique.map((model) => {
      // After applying a model that exposes effort/speed, chain straight into its
      // settings menu (Claude-CLI style: pick model → pick effort). A model with
      // no tunable controls just applies and closes — no dead-end sub-menu.
      const caps = providerModelSettingsCapabilities(providerId, model, process.env);
      const tunable = Boolean(caps.effort || caps.speed);
      return {
        mark: providerId === currentProviderId && model === currentModel ? "●" : undefined,
        label: model,
        hint: provider?.short ?? providerId,
        command: `/model ${providerId} ${model}`,
        ...(tunable ? { afterCommand: { kind: "modelSettings" } as const } : {}),
      };
    }),
  ];
}
