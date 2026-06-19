import type { Settings } from "./store.js";
import { detectBackend } from "../sandbox/profile.js";

// Pure source-of-truth helpers for the /sandbox UI. The OS sandbox runtime truth
// lives in env (VANTA_SANDBOX / VANTA_SHELL_SANDBOX / VANTA_SANDBOX_NET) and is
// honored by sandbox/run.ts; these helpers shape + persist the operator INTENT in
// settings.sandbox and derive the effective state by reading env first, then
// settings as the fallback. No IO — the panel does the read/write.

export type SandboxConfig = NonNullable<Settings["sandbox"]>;
export type SandboxOverride = { tool: string; rule: "bypass" | "enforce" };

/** Effective sandbox state: env wins over persisted settings (env is runtime truth). */
export type SandboxState = {
  enabled: boolean;
  shellOnly: boolean;
  allowNetwork: boolean;
  dependencies: string[];
  overrides: SandboxOverride[];
};

/** Resolve one boolean flag: env wins ("1"=true, anything else=false), else the
 *  persisted setting, else false. env presence is the override signal. */
function flagFrom(raw: string | undefined, persisted: boolean | undefined): boolean {
  if (raw !== undefined) return raw === "1";
  return persisted ?? false;
}

/** Read the effective state. env overrides settings for the three flags. */
export function sandboxState(settings: Settings, env: NodeJS.ProcessEnv): SandboxState {
  const cfg = settings.sandbox ?? {};
  return {
    enabled: flagFrom(env.VANTA_SANDBOX, cfg.enabled),
    shellOnly: flagFrom(env.VANTA_SHELL_SANDBOX, cfg.shellOnly),
    allowNetwork: flagFrom(env.VANTA_SANDBOX_NET, cfg.allowNetwork),
    dependencies: cfg.dependencies ?? [],
    overrides: cfg.overrides ?? [],
  };
}

/** The persisted sandbox config implied by a (possibly toggled) state. */
export function toConfig(state: SandboxState): SandboxConfig {
  return {
    enabled: state.enabled,
    shellOnly: state.shellOnly,
    allowNetwork: state.allowNetwork,
    dependencies: state.dependencies,
    overrides: state.overrides,
  };
}

/** Merge a new sandbox config into settings (preserving every other key). */
export function withSandbox(settings: Settings, sandbox: SandboxConfig): Settings {
  return { ...settings, sandbox };
}

export type ToggleKey = "enabled" | "shellOnly" | "allowNetwork";

/** Flip one boolean flag, returning a new state (pure). */
export function toggle(state: SandboxState, key: ToggleKey): SandboxState {
  return { ...state, [key]: !state[key] };
}

/** The env vars that mirror the persisted flags (so a restart honors the intent). */
export function sandboxEnv(state: SandboxState): Record<string, string> {
  const env: Record<string, string> = {};
  if (state.enabled) env.VANTA_SANDBOX = "1";
  if (state.shellOnly) env.VANTA_SHELL_SANDBOX = "1";
  if (state.allowNetwork) env.VANTA_SANDBOX_NET = "1";
  return env;
}

/** Cycle a tool's override: none → bypass → enforce → none. Pure. */
export function cycleOverride(overrides: SandboxOverride[], tool: string): SandboxOverride[] {
  const current = overrides.find((o) => o.tool === tool)?.rule;
  const without = overrides.filter((o) => o.tool !== tool);
  if (current === undefined) return [...without, { tool, rule: "bypass" }];
  if (current === "bypass") return [...without, { tool, rule: "enforce" }];
  return without; // enforce → cleared
}

/** Resolve whether a tool runs sandboxed, honoring per-tool overrides. */
export function resolveToolSandbox(state: SandboxState, tool: string): boolean {
  const rule = state.overrides.find((o) => o.tool === tool)?.rule;
  if (rule === "bypass") return false;
  if (rule === "enforce") return true;
  return state.enabled;
}

export type DoctorLevel = "ok" | "warn" | "info";
export type DoctorCheck = { label: string; level: DoctorLevel; detail: string };

function backendCheck(platform: NodeJS.Platform): DoctorCheck {
  const backend = detectBackend(platform);
  return backend
    ? { label: "Backend", level: "ok", detail: `${backend} on ${platform}` }
    : { label: "Backend", level: "warn", detail: `no OS sandbox on ${platform} (needs macOS seatbelt / Linux bwrap)` };
}

function enablementCheck(state: SandboxState, platform: NodeJS.Platform): DoctorCheck {
  if (state.enabled && detectBackend(platform) === null) {
    return { label: "Enablement", level: "warn", detail: "sandbox enabled but no backend — code runners will refuse to run" };
  }
  return state.enabled
    ? { label: "Enablement", level: "ok", detail: "code runners sandboxed" }
    : { label: "Enablement", level: "info", detail: "sandbox off (default)" };
}

/** Pure diagnostics over the current sandbox state + platform. No IO. */
export function sandboxDoctor(state: SandboxState, platform: NodeJS.Platform): DoctorCheck[] {
  return [
    backendCheck(platform),
    enablementCheck(state, platform),
    { label: "Shell isolation", level: state.shellOnly ? "ok" : "info", detail: state.shellOnly ? "shell_cmd sandboxed" : "shell_cmd not isolated" },
    { label: "Network", level: state.allowNetwork ? "warn" : "ok", detail: state.allowNetwork ? "network ALLOWED inside sandbox" : "network isolated (default)" },
    { label: "Overrides", level: "info", detail: overrideDetail(state.overrides) },
  ];
}

function overrideDetail(overrides: SandboxOverride[]): string {
  if (overrides.length === 0) return "none";
  const bypass = overrides.filter((o) => o.rule === "bypass").length;
  const enforce = overrides.length - bypass;
  return `${bypass} bypass · ${enforce} enforce`;
}
