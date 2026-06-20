import { join } from "node:path";
import type { Settings } from "../settings/store.js";
import { parsePluginManifest, type PluginManifest } from "./manifest.js";

// VANTA-PLUGIN-CLI — pure/injectable plugin management core.
//
// `vanta plugin list|enable|disable|install|uninstall` manage the user plugin
// set under ~/.vanta/plugins. Every function here is pure or fs-injected so the
// manifest/enabled-list logic is fully unit-testable without touching disk:
//   - listPlugins(fs, home)        → installed plugins + enabled state
//   - setEnabled(settings, name, on) → updated settings (PURE, no IO)
//   - installPlugin(src, fs, home)  → copy a local plugin dir in, validate manifest
//   - uninstallPlugin(name, fs, home) → remove a plugin dir
// Errors are values (Result), never thrown across the boundary. The loader
// already honors settings.plugins.enabled, so enable/disable just edit that list.

/** Hand-rolled errors-as-values. The CLI maps `error` to an exit code + message. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: string): Result<never> => ({ ok: false, error });

/** Injected filesystem port — every disk touch goes through here (tests stub it). */
export type PluginFs = {
  readdir: (dir: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
  isDirectory: (path: string) => Promise<boolean>;
  mkdir: (dir: string) => Promise<void>;
  copyDir: (from: string, to: string) => Promise<void>;
  rmDir: (dir: string) => Promise<void>;
};

/** One installed plugin as `vanta plugin list` reports it. */
export type PluginEntry = {
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
};

/** The plugins root under the Vanta home (~/.vanta/plugins). */
export function pluginsRoot(home: string): string {
  return join(home, "plugins");
}

/** The set of enabled plugin names from settings (the loader's allow-list). */
function enabledSet(settings: Settings): Set<string> {
  return new Set(settings.plugins?.enabled ?? []);
}

/** Read + validate one plugin's manifest. Returns a Result (never throws). */
async function readManifest(fs: PluginFs, dir: string): Promise<Result<PluginManifest>> {
  let raw: string;
  try {
    raw = await fs.readFile(join(dir, "plugin.json"));
  } catch {
    return err(`no plugin.json in ${dir}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err(`plugin.json is not valid JSON in ${dir}`);
  }
  try {
    return ok(parsePluginManifest(parsed));
  } catch (e) {
    return err(`invalid plugin manifest in ${dir}: ${(e as Error).message}`);
  }
}

/**
 * List installed plugins under ~/.vanta/plugins with their enabled state.
 * Directories without a valid plugin.json are skipped (not an error — the
 * folder may be a staging artifact). Returns [] when the dir is absent.
 */
export async function listPlugins(
  fs: PluginFs,
  home: string,
  settings: Settings,
): Promise<PluginEntry[]> {
  const root = pluginsRoot(home);
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return [];
  }
  const enabled = enabledSet(settings);
  const entries: PluginEntry[] = [];
  for (const name of names.sort()) {
    const dir = join(root, name);
    if (!(await fs.isDirectory(dir))) continue;
    const manifest = await readManifest(fs, dir);
    if (!manifest.ok) continue;
    entries.push({
      name: manifest.value.name,
      version: manifest.value.version,
      description: manifest.value.description,
      enabled: enabled.has(manifest.value.name),
    });
  }
  return entries;
}

/**
 * PURE: return settings with `name` added to (on) or removed from
 * plugins.enabled. Idempotent and order-stable; never mutates the input.
 */
export function setEnabled(settings: Settings, name: string, on: boolean): Settings {
  const current = settings.plugins?.enabled ?? [];
  const next = on
    ? current.includes(name) ? current : [...current, name]
    : current.filter((n) => n !== name);
  return { ...settings, plugins: { ...settings.plugins, enabled: next } };
}

/** True when `src` looks like a remote URL (deferred — local path only for now). */
export function isRemoteSource(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/**
 * Install a plugin from a LOCAL directory into ~/.vanta/plugins/<name>.
 * Validates the manifest before copying so a malformed plugin never lands.
 * Remote URLs are deferred (no network dep) — they return a clear Result error.
 * Does NOT enable the plugin (staging is not trust; the operator opts in via
 * `vanta plugin enable`). Returns the installed manifest on success.
 */
export async function installPlugin(
  src: string,
  fs: PluginFs,
  home: string,
): Promise<Result<PluginManifest>> {
  if (isRemoteSource(src)) {
    return err("remote URL install is local path only for now — clone/unpack the plugin and pass the directory path");
  }
  if (!(await fs.isDirectory(src))) {
    return err(`not a directory: ${src}`);
  }
  const manifest = await readManifest(fs, src);
  if (!manifest.ok) return manifest;
  const root = pluginsRoot(home);
  const dest = join(root, manifest.value.name);
  try {
    await fs.mkdir(root);
    await fs.rmDir(dest);
    await fs.copyDir(src, dest);
  } catch (e) {
    return err(`failed to install ${manifest.value.name}: ${(e as Error).message}`);
  }
  return ok(manifest.value);
}

/**
 * Remove an installed plugin's directory. Refuses an empty/path-bearing name so
 * the removal can never escape the plugins root. The caller should also disable
 * the plugin (setEnabled false) so a stale enabled-list entry doesn't linger.
 */
export async function uninstallPlugin(
  name: string,
  fs: PluginFs,
  home: string,
): Promise<Result<string>> {
  if (!name || /[\\/]/.test(name) || name.includes("..")) {
    return err(`invalid plugin name: ${name || "(empty)"}`);
  }
  const dir = join(pluginsRoot(home), name);
  if (!(await fs.isDirectory(dir))) {
    return err(`plugin not installed: ${name}`);
  }
  try {
    await fs.rmDir(dir);
  } catch (e) {
    return err(`failed to uninstall ${name}: ${(e as Error).message}`);
  }
  return ok(name);
}
