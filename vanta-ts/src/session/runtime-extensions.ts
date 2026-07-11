import { mountMcpServers, type McpTrust } from "../mcp/mount.js";
import { mountMcpSkills, type RegisteredMcpSkill } from "../mcp/mount-skills.js";
import { type Settings } from "../settings/store.js";
import { resolveIsolation, skipMcp, skipPlugins, skipSettings, skipSkills } from "../cli/isolation.js";
import { PluginCommandRegistry } from "../plugins/commands.js";
import { PluginPanelRegistry } from "../plugins/panels.js";
import type { PluginWorkerHandle } from "../plugins/worker.js";
import type { buildRegistry } from "../tools/index.js";

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
  /** SETTINGS-BLOCKEDTOOLS-ENFORCE: prepareRun loads + applies settings up front
   *  (so the registry can exclude `blockedTools`) and passes them in to avoid a
   *  second load/apply. Omitted → load here as before (back-compat). */
  preloaded?: Settings,
): Promise<{ settings: Settings; pluginCommands: PluginCommandRegistry; pluginPanels: PluginPanelRegistry; pluginWorkers: PluginWorkerHandle[]; mcpSkills: RegisteredMcpSkill[] }> {
  const settings = preloaded ?? await loadRuntimeSettings(repoRoot);
  // VANTA-SAFE-MODE: safe-mode + bare skip MCP mounting (discovery); only
  // safe-mode skips plugins. Skipped → no servers/plugins register, the command
  // registry stays empty, byte-identical to a config with none enabled.
  const iso = resolveIsolation(process.env);
  if (!skipMcp(iso))
    await mountMcpServers(registry, process.env, (m) => console.log(m), { cwd: repoRoot, trust: mcpTrust });
  const { SLASH_COMMANDS } = await import("../repl/catalog.js");
  const pluginCommands = new PluginCommandRegistry(new Set(SLASH_COMMANDS.map((c) => c.name)));
  const pluginPanels = new PluginPanelRegistry();
  let pluginWorkers: PluginWorkerHandle[] = [];
  if (!skipPlugins(iso)) {
    const { loadEnabledPlugins } = await import("../plugins/loader.js");
    await registerDeclaredPanels(repoRoot, settings, pluginPanels);
    const loaded = await loadEnabledPlugins({ repoRoot, registry, commands: pluginCommands, settings, env: process.env, panels: pluginPanels, log: (m) => console.log(m) });
    pluginWorkers = loaded.workers;
  }
  // MCP-SKILLS: register MCP-provided skills into the same command registry
  // (kernel-gated, opt-in via VANTA_MCP_SKILLS). Best-effort — never fatal.
  // VANTA-SAFE-MODE: MCP-provided skills are both MCP and a skill surface, so
  // either isolation skips them — empty list, same shape as none configured.
  const mcpSkills =
    skipMcp(iso) || skipSkills(iso)
      ? []
      : (await mountMcpSkills(pluginCommands, process.env, { cwd: repoRoot, log: (m) => console.log(m) })
          .catch(() => ({ skills: [] as RegisteredMcpSkill[], dispose: () => {} }))).skills;
  return { settings, pluginCommands, pluginPanels, pluginWorkers, mcpSkills };
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
