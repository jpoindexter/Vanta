// VANTA-PLUGIN-AUTOUPDATE — pure plugin update-check core.
//
// The plugin analogue of the CLI auto-updater (update/version-check.ts). On
// startup Vanta can compare installed plugins against an injected "available
// versions" source and surface a one-line "N plugin update(s) available"
// notice — it NEVER auto-updates; the operator runs `vanta plugins update`.
//
// Everything here is pure + injectable: `checkPluginUpdates` takes the
// installed list AND a `fetchAvailable` dep, so the live network/registry
// fetch is the caller's boundary (NOT auto-run here). A fetch failure degrades
// to "no updates" rather than throwing — a transient blip must never produce a
// false "update available" claim, and must never trigger an update.
//
// Semver comparison is REUSED from the auto-updater (single source of truth):
// `compareSemver`'s tolerance (malformed segments → 0, never throws) means a
// malformed version is simply not flagged as newer — safe by construction.

import { compareSemver } from "../update/version-check.js";

/** A locally-installed plugin and its installed version string. */
export type PluginVersion = { name: string; installed: string };

/** A plugin with a strictly-newer available version. */
export type PluginUpdate = { name: string; installed: string; latest: string };

/**
 * The plugins whose available version is strictly newer than the installed
 * one. `available` maps plugin name → latest known version (e.g. from a
 * marketplace index). A plugin absent from `available`, or whose available
 * version is equal/older/malformed, is not listed. Pure — no side effects.
 */
export function findPluginUpdates(
  installed: readonly PluginVersion[],
  available: Readonly<Record<string, string>>,
): PluginUpdate[] {
  const updates: PluginUpdate[] = [];
  for (const plugin of installed) {
    const latest = available[plugin.name];
    if (latest === undefined) continue;
    // compareSemver tolerance: malformed input compares as 0 → not "newer".
    if (compareSemver(plugin.installed, latest) < 0) {
      updates.push({ name: plugin.name, installed: plugin.installed, latest });
    }
  }
  return updates;
}

/**
 * One-line notice listing available plugin updates, or "" when none.
 * Format: `↑ N plugin update(s): <name> <installed>→<latest>, … — run \`vanta plugins update\``
 * Pure — the caller decides where/whether to print it.
 */
export function buildPluginUpdateNotice(updates: readonly PluginUpdate[]): string {
  if (updates.length === 0) return "";
  const items = updates
    .map((u) => `${u.name} ${u.installed}→${u.latest}`)
    .join(", ");
  const noun = updates.length === 1 ? "update" : "updates";
  return `↑ ${updates.length} plugin ${noun}: ${items} — run \`vanta plugins update\``;
}

/**
 * Whether the startup plugin-update check is enabled. Default OFF so startup
 * stays fast/unchanged; opt in with `VANTA_PLUGIN_UPDATE_CHECK=1` (or `true`).
 */
export function pluginUpdateEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.VANTA_PLUGIN_UPDATE_CHECK ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

/** Injected dependencies for {@link checkPluginUpdates}. */
export type CheckPluginUpdatesDeps = {
  /** The locally-installed plugins (e.g. read from the plugin store). */
  installed: readonly PluginVersion[];
  /**
   * Resolves name → latest available version. The live network/registry fetch
   * lives HERE, injected by the caller — this module never reaches the
   * network. A thrown error degrades to "no updates" (best-effort).
   */
  fetchAvailable: () => Promise<Readonly<Record<string, string>>>;
};

/**
 * Best-effort: fetch available versions, then return the update list.
 * NEVER auto-updates and NEVER throws — a `fetchAvailable` failure degrades to
 * `[]` so a transient problem yields no false "update available" claim. The
 * operator is the one who runs the update; this only reports.
 */
export async function checkPluginUpdates(
  deps: CheckPluginUpdatesDeps,
): Promise<PluginUpdate[]> {
  let available: Readonly<Record<string, string>>;
  try {
    available = await deps.fetchAvailable();
  } catch {
    return [];
  }
  return findPluginUpdates(deps.installed, available);
}
