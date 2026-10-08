import { mountMcpServers, type McpTrust } from "../mcp/mount.js";
import { mountMcpSkills, type RegisteredMcpSkill } from "../mcp/mount-skills.js";
import { type Settings } from "../settings/store.js";
import { resolveIsolation, skipMcp, skipPlugins, skipSettings, skipSkills } from "../cli/isolation.js";
import { PluginCommandRegistry } from "../plugins/commands.js";
import { PluginPanelRegistry } from "../plugins/panels.js";
import type { PluginWorkerHandle } from "../plugins/worker.js";
import type { buildRegistry } from "../tools/index.js";
import { mcpAutoMountEnabled } from "../settings/mcp-access.js";
import type { EffectGateContext } from "../effects/execute-effect.js";

/** SETTINGS-BLOCKEDTOOLS-ENFORCE: load + apply settings once. prepareRun calls
 *  this BEFORE buildRegistry so it can exclude `settings.blockedTools`. Failure
 *  to read settings degrades to empty (current behavior — env stays untouched). */
export async function loadRuntimeSettings(repoRoot: string): Promise<Settings> {
  if (skipSettings(resolveIsolation(process.env))) return {};
  const { loadSettings, applySettingsEnv } = await import("../settings/store.js");
  const settings = await loadSettings(repoRoot, process.env).catch(() => ({}));
  applySettingsEnv(settings, process.env);
  return settings;
}

export async function loadRuntimeExtensions(
  repoRoot: string,
  registry: ReturnType<typeof buildRegistry>,
  mcpTrust?: McpTrust,
  options: { settings?: Settings; effectGate?: EffectGateContext } = {},
): Promise<{ settings: Settings; pluginCommands: PluginCommandRegistry; pluginPanels: PluginPanelRegistry; pluginWorkers: PluginWorkerHandle[]; mcpSkills: RegisteredMcpSkill[]; dispose: () => void }> {
  const settings = options.settings ?? await loadRuntimeSettings(repoRoot);
  const effectGate = options.effectGate;
  // Startup mounting remains opt-in; context/settings are shared with prepareRun.
  const iso = resolveIsolation(process.env);
  const disposers: (() => void)[] = [];
  if (!skipMcp(iso) && mcpAutoMountEnabled(settings.mcp ?? {}, process.env))
    disposers.push((await mountMcpServers(registry, process.env, (m) => console.log(m), { cwd: repoRoot, trust: mcpTrust, effectGate })).dispose);
  const { SLASH_COMMANDS } = await import("../repl/catalog.js");
  const pluginCommands = new PluginCommandRegistry(new Set(SLASH_COMMANDS.map((c) => c.name)));
  const pluginPanels = new PluginPanelRegistry();
  let pluginWorkers: PluginWorkerHandle[] = [];
  if (!skipPlugins(iso)) {
    const { loadEnabledPlugins } = await import("../plugins/loader.js");
    await registerDeclaredPanels(repoRoot, settings, pluginPanels);
    const loaded = await loadEnabledPlugins({
      repoRoot,
      registry,
      commands: pluginCommands,
      settings,
      env: process.env,
      panels: pluginPanels,
      log: (m) => console.log(m),
      effectGate,
    });
    pluginWorkers = loaded.workers;
    disposers.push(...loaded.workers.map((worker) => worker.dispose), ...loaded.monitors.map((monitor) => monitor.disarm));
  }
  // Skills remain opt-in and isolation-gated.
  const mcpSkills =
    skipMcp(iso) || skipSkills(iso)
      ? []
      : await runtimeMcpSkills(pluginCommands, repoRoot, disposers);
  return { settings, pluginCommands, pluginPanels, pluginWorkers, mcpSkills, dispose: () => disposers.forEach((dispose) => dispose()) };
}

async function runtimeMcpSkills(commands: PluginCommandRegistry, root: string, disposers: (() => void)[]): Promise<RegisteredMcpSkill[]> {
  const mounted = await mountMcpSkills(commands, process.env, { cwd: root, log: (m) => console.log(m) })
    .catch(() => ({ skills: [] as RegisteredMcpSkill[], dispose: () => {} }));
  disposers.push(mounted.dispose);
  return mounted.skills;
}

async function registerDeclaredPanels(repoRoot: string, settings: Settings, panels: PluginPanelRegistry): Promise<void> {
  const { discoverPlugins } = await import("../plugins/loader.js");
  const enabled = new Set(settings.plugins?.enabled ?? []);
  for (const candidate of await discoverPlugins(repoRoot, settings, process.env).catch(() => [])) {
    if (!enabled.has(candidate.manifest.name)) continue;
    const granted = settings.plugins?.capabilities?.[candidate.manifest.name] ?? [];
    for (const panel of candidate.manifest.dashboardPanels ?? []) {
      try { panels.publish(candidate.manifest.name, panel, [], granted); }
      catch (error) { console.log(`  · plugin ${candidate.manifest.name}: panel ${panel.id} disabled (${(error as Error).message})`); }
    }
  }
}
