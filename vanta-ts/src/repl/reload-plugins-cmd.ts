import { dirname } from "node:path";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

/** The reload plan: enabled-but-not-loaded plugins to load vs ones already loaded. */
export type ReloadPlan = { toLoad: string[]; alreadyLoaded: string[] };

/** Stable de-dupe preserving first-seen order. */
function uniqueStable(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Compute which enabled plugins are newly available vs already loaded.
 * - enabled-but-not-loaded → toLoad (in enabled order, deduped)
 * - the intersection (enabled ∧ loaded) → alreadyLoaded (in enabled order, deduped)
 * Pure: no I/O, order stable, idempotent.
 */
export function planPluginReload(enabledNames: readonly string[], loadedNames: readonly string[]): ReloadPlan {
  const enabled = uniqueStable(enabledNames);
  const loaded = new Set(uniqueStable(loadedNames));
  const toLoad: string[] = [];
  const alreadyLoaded: string[] = [];
  for (const name of enabled) (loaded.has(name) ? alreadyLoaded : toLoad).push(name);
  return { toLoad, alreadyLoaded };
}

/** Render the reload plan as the user-facing summary line. Pure. */
export function formatReloadResult(plan: ReloadPlan): string {
  if (!plan.toLoad.length) return `  no new plugins (${plan.alreadyLoaded.length} already loaded)`;
  return `  ↻ ${plan.toLoad.length} new plugin(s) available: ${plan.toLoad.join(", ")} — loaded`;
}

/** Reads the enabled set + the loaded set from the session, both injected for testability. */
export type ReloadDeps = {
  /** The enabled-plugin allow-list, re-read fresh so a mid-session enable is seen. */
  readEnabled: () => Promise<readonly string[]> | readonly string[];
  /** Plugin names already loaded into the live session. */
  readLoaded: () => Promise<readonly string[]> | readonly string[];
  /** The wire to the real loader for the newly-available plugins — the actual load. */
  loadPlugins?: (names: readonly string[]) => Promise<void> | void;
};

/**
 * /reload-plugins — re-scan the enabled-plugins config, report which plugins are
 * newly available vs already loaded, and delegate the actual load of the new set
 * to the injected loader (which still registers through the kernel-gated dispatch
 * path). Nothing new → "no new plugins".
 */
export async function runReloadPlugins(deps: ReloadDeps): Promise<SlashResult> {
  const plan = planPluginReload(await deps.readEnabled(), await deps.readLoaded());
  if (plan.toLoad.length && deps.loadPlugins) await deps.loadPlugins(plan.toLoad);
  return { output: formatReloadResult(plan) };
}

/** Build the live enabled/loaded readers from the REPL context. */
function liveDeps(ctx: ReplCtx): ReloadDeps {
  // The kernel data dir is the project's `.vanta/`; its parent is the repo root.
  const repoRoot = dirname(ctx.dataDir);
  return {
    async readEnabled() {
      const { loadSettings } = await import("../settings/store.js");
      const settings = await loadSettings(repoRoot, ctx.env).catch(() => ({}) as Awaited<ReturnType<typeof loadSettings>>);
      return settings.plugins?.enabled ?? [];
    },
    readLoaded() {
      return ctx.setup.pluginCommands?.loadedPlugins() ?? [];
    },
    async loadPlugins(names) {
      const { loadEnabledPlugins } = await import("../plugins/loader.js");
      const { loadSettings } = await import("../settings/store.js");
      const settings = await loadSettings(repoRoot, ctx.env).catch(() => ({}) as Awaited<ReturnType<typeof loadSettings>>);
      // Load only the newly-available subset; the loader registers tools/commands
      // through the same kernel-gated dispatch path as a startup load.
      await loadEnabledPlugins({
        repoRoot,
        registry: ctx.setup.registry,
        commands: ctx.setup.pluginCommands,
        settings: { ...settings, plugins: { ...settings.plugins, enabled: [...names] } },
        env: ctx.env,
      });
    },
  };
}

/** /reload-plugins handler — wires the live readers + loader into the pure plan. */
export const reloadPlugins: SlashHandler = (_arg, ctx) => runReloadPlugins(liveDeps(ctx));
