import { readFile } from "node:fs/promises";
import {
  loadSettings, writeSettings, localSettingsPath, type Settings,
} from "../settings/store.js";
import {
  configState, nextEffort, nextStyle, nextAnchor,
  type ConfigState, type ConfigAction, type GateKey,
} from "./config-view.js";

// Live IO + callback wiring for the /config overlay. Mirrors ui/sandbox-actions:
// the overlay carries the effective state + an onAction closure bound to the
// overlay setter. Each persisting action merges into .vanta/settings.local.json
// (the precedence winner) and refreshes the overlay in place; a `command` action
// instead defers to the host (the model row reuses the existing model picker
// overlay). env stays the runtime truth — re-derive after every write so
// env-overridden flags read honestly.

export type ConfigOverlayState = {
  state: ConfigState;
  onAction: (action: ConfigAction) => void;
};

/** The overlay variant this module produces. The host union must include it. */
export type ConfigView = { kind: "config" } & ConfigOverlayState;

/** Talk to the host overlay state without importing its union (avoids a cycle):
 *  publish a rebuilt view, ask whether the overlay is still open, and open another
 *  overlay (the model row reopens the model picker rather than reimplementing it). */
export type ConfigOverlayHost = {
  publish: (view: ConfigView) => void;
  isOpen: () => boolean;
  openCommand: (command: string) => void;
};

/** Read the local settings scope so a write merges in (preserving other keys). */
async function readLocal(repoRoot: string): Promise<Settings> {
  try {
    const parsed = JSON.parse(await readFile(localSettingsPath(repoRoot), "utf8"));
    return (parsed && typeof parsed === "object") ? (parsed as Settings) : {};
  } catch {
    return {};
  }
}

function applyGate(settings: Settings, gate: GateKey, value: boolean): Settings {
  return { ...settings, gates: { ...settings.gates, [gate]: value } };
}

/** Merge one action into the local settings. Pure given the loaded scope + effective state. */
function mergeAction(local: Settings, action: ConfigAction, state: ConfigState): Settings {
  switch (action.kind) {
    case "cycleEffort": return { ...local, effortLevel: nextEffort(state.effort) };
    case "cycleStyle": return { ...local, ui: { ...local.ui, outputStyle: nextStyle(state.outputStyle) } };
    case "cycleAnchor": return { ...local, ui: { ...local.ui, composerAnchor: nextAnchor(state.composerAnchor) } };
    case "toggleAuto": return { ...local, autoMode: { ...local.autoMode, enabled: !state.autoMode } };
    case "toggleSandbox": return { ...local, sandbox: { ...local.sandbox, enabled: !state.sandbox } };
    case "toggleSandboxShell": return { ...local, sandbox: { ...local.sandbox, shellOnly: !state.sandboxShellOnly } };
    case "toggleGate": return applyGate(local, action.gate, !state.gates[action.gate]);
    default: return local;
  }
}

/** Persist an action to the local scope; return the re-derived effective state. */
async function persist(repoRoot: string, action: ConfigAction, state: ConfigState): Promise<ConfigState> {
  const merged = mergeAction(await readLocal(repoRoot), action, state);
  await writeSettings(localSettingsPath(repoRoot), merged);
  const effective = await loadSettings(repoRoot, process.env);
  return configState(effective, process.env);
}

function buildView(state: ConfigState, repoRoot: string, host: ConfigOverlayHost): ConfigView {
  const onAction = (action: ConfigAction): void => {
    if (action.kind === "command") return host.openCommand(action.command);
    if (action.kind === "none") return;
    void persist(repoRoot, action, state).then((re) => {
      if (host.isOpen()) host.publish(buildView(re, repoRoot, host));
    });
  };
  return { kind: "config", state, onAction };
}

/** Build the interactive /config overlay. Loads effective state, wires persisting actions. */
export async function buildConfigOverlay(repoRoot: string, host: ConfigOverlayHost): Promise<ConfigView> {
  const settings = await loadSettings(repoRoot, process.env);
  return buildView(configState(settings, process.env), repoRoot, host);
}
