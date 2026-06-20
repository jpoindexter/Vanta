import { statSync } from "node:fs";
import type { Settings } from "./store.js";
import { userSettingsPath, projectSettingsPath, localSettingsPath } from "./store.js";

// VANTA-SETTINGS-HOT-RELOAD — detect a settings-file change between checks and
// re-apply ONLY the safe env-applied subset (the `settings.env` map, via
// applySettingsEnv) WITHOUT a restart. No registry/prompt rebuild — those are
// session-construction concerns, not safe to redo mid-turn. Pure + injectable:
// `settingsChanged` is a value comparison; `reloadSettingsIfChanged` injects
// every effect (readSig/loadSettings/applyEnv) so it is fully unit-testable.
// No change → no work, no behavior change.

/** Combined signature across the three settings scopes. `null` segments = the
 *  file was missing or unreadable at probe time (so the sig is still stable). */
export type SettingsSig = string;

/** True when the current signature differs from the prior one. A `null`/empty
 *  prior (first probe) is NOT a change — there is no prior load to diverge from.
 *  Pure. */
export function settingsChanged(prevSig: SettingsSig | null, currentSig: SettingsSig): boolean {
  if (prevSig === null || prevSig === "") return false;
  return prevSig !== currentSig;
}

/** One file's signature segment: `mtimeMs` or `-` when missing/unreadable. */
function fileSig(path: string): string {
  try {
    return String(statSync(path).mtimeMs);
  } catch {
    return "-";
  }
}

/**
 * Default signature reader: concatenated mtimeMs of all three settings scopes.
 * A missing file contributes a stable `-`, so creating/deleting a scope file is
 * itself a detectable change. Pure aside from the stat reads.
 */
export function readSettingsSig(repoRoot: string, env?: NodeJS.ProcessEnv): SettingsSig {
  return [
    fileSig(userSettingsPath(env)),
    fileSig(projectSettingsPath(repoRoot)),
    fileSig(localSettingsPath(repoRoot)),
  ].join("|");
}

/** Injected effects + prior state for one hot-reload probe. */
export interface ReloadDeps {
  /** Compute the current signature (default: `readSettingsSig`). */
  readSig: () => SettingsSig;
  /** Load + validate the merged settings (default: `loadSettings`). */
  loadSettings: () => Promise<Settings>;
  /** Re-apply the safe env-applied subset (default: `applySettingsEnv`). */
  applyEnv: (settings: Settings) => void;
  /** The signature from the previous probe; `null` on the first probe. */
  prevSig: SettingsSig | null;
}

/** Result of one probe: a reload carries the new sig + applied settings. */
export type ReloadResult =
  | { reloaded: true; newSig: SettingsSig; settings: Settings }
  | { reloaded: false };

/**
 * Probe the settings files once. When the signature changed since `prevSig`,
 * re-load the settings and re-apply the safe env subset, returning the new sig +
 * settings. Unchanged → `{reloaded:false}` (no work). A load that throws
 * (missing/corrupt) is treated as no reload — the prior applied state is kept
 * (errors-as-values; the caller keeps `prevSig` so a later valid write still
 * fires). Never throws across the boundary.
 */
export async function reloadSettingsIfChanged(deps: ReloadDeps): Promise<ReloadResult> {
  let currentSig: SettingsSig;
  try {
    currentSig = deps.readSig();
  } catch {
    return { reloaded: false };
  }
  if (!settingsChanged(deps.prevSig, currentSig)) return { reloaded: false };
  let settings: Settings;
  try {
    settings = await deps.loadSettings();
  } catch {
    // Corrupt/unreadable settings: keep prior applied state, no reload. The
    // caller retains its old prevSig so the next valid write re-triggers.
    return { reloaded: false };
  }
  try {
    deps.applyEnv(settings);
  } catch {
    return { reloaded: false };
  }
  return { reloaded: true, newSig: currentSig, settings };
}
