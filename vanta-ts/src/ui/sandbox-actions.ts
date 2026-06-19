import { readFile } from "node:fs/promises";
import {
  loadSettings, writeSettings, localSettingsPath, type Settings,
} from "../settings/store.js";
import {
  sandboxState, toggle, withSandbox, toConfig, cycleOverride, sandboxDoctor,
  type SandboxState, type ToggleKey, type DoctorCheck,
} from "../settings/sandbox.js";

// Live IO + callback wiring for the /sandbox overlay. Mirrors ui/mcp-panel's
// reconnect closure: the overlay carries the effective state, the doctor report,
// and onToggle/onCycleOverride closures bound to the overlay setter. Each closure
// persists the new config to .vanta/settings.local.json (the precedence winner,
// matching how applySettingsEnv layers) and refreshes the overlay in place.

export type SandboxOverlayState = {
  state: SandboxState;
  doctor: DoctorCheck[];
  onToggle: (key: ToggleKey) => void;
  onCycleOverride: (tool: string) => void;
};

/** The overlay variant this module produces. The host union must include it. */
export type SandboxView = { kind: "sandbox" } & SandboxOverlayState;

/** How the action module talks to the host overlay state without importing its
 *  union (avoids a cycle): publish a rebuilt sandbox view, and ask whether the
 *  sandbox overlay is still the open one before an in-place refresh lands. */
export type SandboxOverlayHost = {
  publish: (view: SandboxView) => void;
  isOpen: () => boolean;
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

/** Persist a new sandbox state to the local scope; return the re-derived effective state. */
async function persist(repoRoot: string, next: SandboxState): Promise<SandboxState> {
  const local = await readLocal(repoRoot);
  const merged = withSandbox(local, toConfig(next));
  await writeSettings(localSettingsPath(repoRoot), merged);
  // Re-derive from the merged result + env so env-overridden flags stay honest.
  const effective = await loadSettings(repoRoot, process.env);
  return sandboxState(effective, process.env);
}

function buildView(state: SandboxState, repoRoot: string, host: SandboxOverlayHost): SandboxView {
  const refresh = (next: SandboxState): void => {
    void persist(repoRoot, next).then((re) => {
      if (host.isOpen()) host.publish(buildView(re, repoRoot, host));
    });
  };
  return {
    kind: "sandbox",
    state,
    doctor: sandboxDoctor(state, process.platform),
    onToggle: (key: ToggleKey) => refresh(toggle(state, key)),
    onCycleOverride: (tool: string) => refresh({ ...state, overrides: cycleOverride(state.overrides, tool) }),
  };
}

/** Build the interactive /sandbox overlay. Loads effective state, wires persisting toggles. */
export async function buildSandboxOverlay(repoRoot: string, host: SandboxOverlayHost): Promise<SandboxView> {
  const settings = await loadSettings(repoRoot, process.env);
  const state = sandboxState(settings, process.env);
  return buildView(state, repoRoot, host);
}
