import { EFFORT_LEVELS, type EffortLevel } from "../types.js";
import type { Settings } from "../settings/store.js";

// Pure view-shaping for the interactive /config panel. No IO, no Ink. Derives the
// effective settings state (env wins over persisted settings, mirroring sandbox.ts),
// groups it into labelled rows, and resolves each row's edit action. The panel
// renders the rows + dispatches the action; ui/config-actions.ts persists. Dangerous
// raw fields (allowed/blockedTools, env, autoMode.rules) are never surfaced here.

export type OutputStyle = "concise" | "normal" | "verbose";
export const OUTPUT_STYLES = ["concise", "normal", "verbose"] as const;
export type ComposerAnchor = "float" | "bottom";

/** The four ND gates the panel exposes (subset of settings.gates). */
export type GateKey = "antiSlop" | "modeDetect" | "researchGate" | "stallUnblock";
export const GATE_KEYS = ["antiSlop", "modeDetect", "researchGate", "stallUnblock"] as const;

/** Effective config the panel reads. env-overridable flags resolve env-first. */
export type ConfigState = {
  effort: EffortLevel;
  outputStyle: OutputStyle;
  composerAnchor: ComposerAnchor;
  promptSuggestions: boolean;
  autoMode: boolean;
  sandbox: boolean;
  sandboxShellOnly: boolean;
  gates: Record<GateKey, boolean>;
  model: string;
};

/** Resolve a boolean flag: a "0"/"1" env value wins, else the persisted setting. */
function flagFrom(raw: string | undefined, persisted: boolean | undefined, dflt: boolean): boolean {
  if (raw === "0") return false;
  if (raw === "1") return true;
  return persisted ?? dflt;
}

function asEffort(value: string | undefined, persisted: EffortLevel | undefined): EffortLevel {
  if (value && (EFFORT_LEVELS as readonly string[]).includes(value)) return value as EffortLevel;
  return persisted ?? "medium";
}

function asStyle(value: string | undefined): OutputStyle {
  return value && (OUTPUT_STYLES as readonly string[]).includes(value) ? (value as OutputStyle) : "normal";
}

function asAnchor(value: string | undefined, persisted: ComposerAnchor | undefined): ComposerAnchor {
  if (value === "float" || value === "bottom") return value;
  return persisted ?? "float";
}

/** Read the effective state. env overrides persisted settings where it can. */
export function configState(settings: Settings, env: NodeJS.ProcessEnv): ConfigState {
  const g = settings.gates ?? {};
  return {
    effort: asEffort(env.VANTA_EFFORT_LEVEL, settings.effortLevel),
    outputStyle: asStyle(settings.ui?.outputStyle),
    composerAnchor: asAnchor(env.VANTA_COMPOSER_ANCHOR, settings.ui?.composerAnchor),
    promptSuggestions: flagFrom(env.VANTA_PROMPT_SUGGESTIONS, settings.ui?.promptSuggestionsEnabled, false),
    autoMode: flagFrom(env.VANTA_AUTO_MODE, settings.autoMode?.enabled, false),
    sandbox: flagFrom(env.VANTA_SANDBOX, settings.sandbox?.enabled, false),
    sandboxShellOnly: flagFrom(env.VANTA_SHELL_SANDBOX, settings.sandbox?.shellOnly, false),
    gates: {
      antiSlop: flagFrom(env.VANTA_ANTI_SLOP, g.antiSlop, true),
      modeDetect: flagFrom(env.VANTA_MODE_DETECT, g.modeDetect, true),
      researchGate: g.researchGate ?? true,
      stallUnblock: g.stallUnblock ?? true,
    },
    model: env.VANTA_MODEL ?? "",
  };
}

/** A row's edit action. `cycle`/`toggle` mutate via the actions module; `command`
 * defers to a slash command (the model row reuses the existing model picker). */
export type ConfigAction =
  | { kind: "cycleEffort" }
  | { kind: "cycleStyle" }
  | { kind: "cycleAnchor" }
  | { kind: "togglePromptSuggestions" }
  | { kind: "toggleAuto" }
  | { kind: "toggleSandbox" }
  | { kind: "toggleSandboxShell" }
  | { kind: "toggleGate"; gate: GateKey }
  | { kind: "command"; command: string }
  | { kind: "none" };

/** A panel row: a labelled current value + the action ⏎ runs. `bool` drives the
 * ●/○ glyph for toggles; `value` is the displayed current value for cyclers. */
export type ConfigRow = { label: string; value: string; action: ConfigAction; bool?: boolean; hint?: string };

/** A labelled group of rows (rendered as a section in the panel). */
export type ConfigGroup = { title: string; rows: ConfigRow[] };

const GATE_LABEL: Record<GateKey, string> = {
  antiSlop: "Anti-slop check",
  modeDetect: "Mode detection",
  researchGate: "Research gate",
  stallUnblock: "Stall unblock",
};

function onOff(on: boolean): string {
  return on ? "on" : "off";
}

/** The grouped rows for the panel, derived from the effective state. Pure. */
export function configGroups(state: ConfigState): ConfigGroup[] {
  return [
    {
      title: "Session",
      rows: [
        { label: "Effort level", value: state.effort, action: { kind: "cycleEffort" }, hint: "VANTA_EFFORT_LEVEL" },
        { label: "Output style", value: state.outputStyle, action: { kind: "cycleStyle" }, hint: "reply verbosity" },
        { label: "Composer anchor", value: state.composerAnchor, action: { kind: "cycleAnchor" }, hint: "float / pinned" },
        { label: "Prompt suggestions", value: onOff(state.promptSuggestions), bool: state.promptSuggestions, action: { kind: "togglePromptSuggestions" }, hint: "next prompts" },
        { label: "Model", value: state.model || "(active)", action: { kind: "command", command: "/model" }, hint: "⏎ opens the picker" },
      ],
    },
    {
      title: "Permissions",
      rows: [
        { label: "Auto mode", value: onOff(state.autoMode), bool: state.autoMode, action: { kind: "toggleAuto" }, hint: "auto-approve safe actions" },
        { label: "Sandbox code runners", value: onOff(state.sandbox), bool: state.sandbox, action: { kind: "toggleSandbox" }, hint: "VANTA_SANDBOX" },
        { label: "Sandbox shell-only", value: onOff(state.sandboxShellOnly), bool: state.sandboxShellOnly, action: { kind: "toggleSandboxShell" }, hint: "→ /sandbox for more" },
      ],
    },
    {
      title: "ND gates",
      rows: GATE_KEYS.map((gate) => ({
        label: GATE_LABEL[gate],
        value: onOff(state.gates[gate]),
        bool: state.gates[gate],
        action: { kind: "toggleGate", gate } as ConfigAction,
      })),
    },
  ];
}

/** Flatten the groups into the row list the cursor indexes over (group order). */
export function configRows(state: ConfigState): ConfigRow[] {
  return configGroups(state).flatMap((g) => g.rows);
}

/** The action for a flat row index (keeps the panel from hardcoding order). */
export function actionAt(state: ConfigState, index: number): ConfigAction {
  return configRows(state)[index]?.action ?? { kind: "none" };
}

/** One-line header summary of the effective config. Pure. */
export function configSummary(state: ConfigState): string {
  const on = GATE_KEYS.filter((k) => state.gates[k]).length;
  return `effort ${state.effort} · ${state.outputStyle} · ${on}/${GATE_KEYS.length} gates`;
}

/** Cycle an effort level low→medium→high→xhigh→max→low. Pure. */
export function nextEffort(current: EffortLevel): EffortLevel {
  const i = EFFORT_LEVELS.indexOf(current);
  return EFFORT_LEVELS[(i + 1) % EFFORT_LEVELS.length]!;
}

/** Cycle an output style concise→normal→verbose→concise. Pure. */
export function nextStyle(current: OutputStyle): OutputStyle {
  const i = OUTPUT_STYLES.indexOf(current);
  return OUTPUT_STYLES[(i + 1) % OUTPUT_STYLES.length]!;
}

/** Toggle the composer anchor float↔bottom. Pure. */
export function nextAnchor(current: ComposerAnchor): ComposerAnchor {
  return current === "float" ? "bottom" : "float";
}
