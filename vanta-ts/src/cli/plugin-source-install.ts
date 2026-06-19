import { loadSettings, type Settings } from "../settings/store.js";
import { installPlugin, type InstallDeps } from "../plugins/install.js";
import type { PluginSource } from "./plugin-source-flags.js";

// VANTA-PLUGIN-URL: orchestrate `--plugin-url`/`--plugin-dir` installs at session
// start. Runs BEFORE loadEnabledPlugins so a staged plugin is discoverable, but
// never enables it — an installed-but-disabled plugin stays inert until the
// operator adds it to settings.plugins.enabled. Best-effort: a bad source logs a
// clear message and the session continues.

export type InstallLog = (message: string) => void;

/** Stage each parsed plugin source into ~/.vanta/plugins. Returns installed names. */
export async function installPluginSources(
  repoRoot: string,
  sources: PluginSource[],
  opts: { env?: NodeJS.ProcessEnv; log?: InstallLog; deps?: InstallDeps } = {},
): Promise<string[]> {
  if (!sources.length) return [];
  const env = opts.env ?? process.env;
  const log = opts.log ?? ((m: string) => console.log(m));
  const settings: Settings = await loadSettings(repoRoot, env).catch(() => ({}));
  const enabled = settings.plugins?.enabled ?? [];
  const installed: string[] = [];
  for (const source of sources) {
    const label = source.url ?? source.dir ?? "(unknown)";
    try {
      const result = await installPlugin(source, { env, enabled, deps: opts.deps });
      installed.push(result.name);
      log(`  · plugin: installed ${result.name} from ${label}`);
      log(
        result.enabled
          ? `  · plugin: ${result.name} is enabled and will load this session`
          : `  · plugin: ${result.name} is staged but DISABLED — add it to settings.plugins.enabled to load it (untrusted code stays off until you opt in)`,
      );
    } catch (err) {
      log(`  · plugin: failed to install from ${label}: ${(err as Error).message}`);
    }
  }
  return installed;
}
